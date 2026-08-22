// Shared booking logic used by both the delegated-payment flow
// (/api/bookings/delegate + /api/pay/[token]) and — eventually — the main
// checkout route. Mirrors the pre-charge validation (steps 1–8) and the
// post-payment finalize chain (door code + gcal + confirmations) of
// POST /api/bookings so all payment paths behave identically.
//
// NOTE: the live POST /api/bookings still inlines its own copies of this logic.
// Rewiring it to import from here is a safe follow-up once the delegated flow is
// verified — until then, keep the two in sync if you touch pricing/guest rules.

import { randomUUID } from 'crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { sendBookingConfirmation, sendNewBookingAlert, formatTimeLabel, formatDateLabel, formatGuestLine } from '@/lib/email'
import { checkBannedAndAlert } from '@/lib/flagged-customer'
import { checkCartAvailability } from '@/lib/equipment-availability'
import { checkSetWindows, checkBuyoutWindow } from '@/lib/set-availability'
import { violatesAdvanceWindow, ADVANCE_WINDOW_ERROR } from '@/lib/short-notice'
import { createBookingPin, createBackDoorPin, DOOR_CODE_HOWTO } from '@/lib/igloohome'
import { largestVisitGap, VISIT_GAP_GRACE_HOURS, bookingHourToISO, centralDateStr, centralHourDecimal } from '@/lib/booking-times'
import { createCalendarEvent, gcalSyncEnabled } from '@/lib/gcal'
import { STUDIO_ADDRESS } from '@/lib/calendar'
import { sendSMS } from '@/lib/sms'
import { sendOwnerPush } from '@/lib/push'

// ─── Types ────────────────────────────────────────────────────────────────

export interface SetLine {
  setSlug:   string
  date:      string   // YYYY-MM-DD
  startHour: number
  endHour:   number
}

export interface BookingCoreInput {
  type:      'set' | 'studio'
  setSlug:   string | null
  date:      string
  startHour: number
  endHour:   number
  sets?:     SetLine[]
  equipment: { equipment_id: string; quantity: number }[]
  name:      string
  email:     string
  phone:     string
  notes:     string
  guests?:   number | null
  totalCents: number
}

export interface OrderLine {
  type:      'set' | 'studio'
  setSlug:   string | null
  setId:     string | null
  setName:   string
  date:      string
  startHour: number
  endHour:   number
  startISO:  string
  endISO:    string
  spaceDollars:    number
  stdSpaceDollars: number
}

export interface PricedOrder {
  lines:        OrderLine[]
  verifiedCents: number
  guestCount:   number
  guestFeeDollars: number
  guestSurchargeDollars: number
  equipRates:   Record<string, number>
  customerPricingOverrides: any
  primary:      OrderLine
}

// ─── Maps / pricing ─────────────────────────────────────────────────────────

export const SLUG_TO_NAME: Record<string, string> = {
  'set-a': 'Set A', 'set-b': 'Set B', 'set-c': 'Set C', 'set-d': 'Set D',
  'concrete': 'Concrete', 'vintage': 'Vintage', 'cottage': 'Cottage',
  'watering-hole': 'The Watering Hole', 'the-tank': 'The Tank', 'studio-one': 'Studio One',
}

const SET_PRICES: Record<string, number> = {
  'set-a': 40, 'set-b': 40, 'set-c': 40, 'set-d': 40,
  'concrete': 40, 'vintage': 40, 'cottage': 40,
  'watering-hole': 75, 'the-tank': 75, 'studio-one': 65,
}

export const SET_MIN_HOURS: Record<string, number> = { 'watering-hole': 2, 'the-tank': 2 }

export function setRateFor(slug: string, pricingOverrides?: any): number {
  let rate = SET_PRICES[slug] ?? 0
  if (pricingOverrides) {
    const perSet = pricingOverrides.sets?.[slug]
    const global = pricingOverrides.hourly_rate
    if (perSet != null) rate = Number(perSet)
    else if (global != null) rate = Number(global)
  }
  return rate
}

function equipmentDollars(
  equipment: { equipment_id: string; quantity: number }[],
  equipRates: Record<string, number>,
  pricingOverrides?: any
): number {
  let total = (equipment ?? []).reduce(
    (sum, l) => sum + (equipRates[l.equipment_id] ?? 0) * (l.quantity ?? 1), 0)
  if (pricingOverrides?.equipment_discount_percent) {
    total = Math.round(total * (1 - Number(pricingOverrides.equipment_discount_percent) / 100))
  }
  return total
}

// ─── Time helpers ─────────────────────────────────────────────────────────

export function fmt12(h: number) {
  const hour = Math.floor(h)
  const mins = h % 1 !== 0 ? '30' : '00'
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12  = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:${mins}${ampm}`
}

export function hoursToISO(date: string, h: number): string {
  // Offset is computed for the date, not assumed — see lib/booking-times.
  return bookingHourToISO(date, h)
}

async function getSetId(supabase: SupabaseClient, slug: string): Promise<string | null> {
  const name = SLUG_TO_NAME[slug]
  if (!name) return null
  const { data } = await supabase.from('sets').select('id').eq('name', name).single()
  return data?.id ?? null
}

// ─── validateAndPriceOrder — pre-charge checks (mirrors route.ts steps 1–8) ──

export type ValidateResult =
  | { ok: true; order: PricedOrder }
  | { ok: false; error: string; status: number }

export async function validateAndPriceOrder(
  supabase: SupabaseClient,
  body: BookingCoreInput,
  opts: { isMember?: boolean; allowShortNotice?: boolean } = {}
): Promise<ValidateResult> {
  // 1. Customer pricing overrides
  let customerPricingOverrides: any = null
  if (body.email) {
    const { data: custPricing } = await supabase
      .from('customers').select('pricing_overrides')
      .eq('email', body.email.toLowerCase().trim()).maybeSingle()
    customerPricingOverrides = custPricing?.pricing_overrides ?? null
  }

  // 2. Settings
  const { data: settingRows } = await supabase
    .from('studio_settings').select('key, value')
    .in('key', ['buyout_rate', 'guest_capacity_per_set', 'per_person_fee', 'max_guests_per_set', 'guest_surcharge_per_hour'])
  const settingMap: Record<string, string> = {}
  for (const s of settingRows ?? []) settingMap[s.key] = s.value
  const buyoutRate      = Number(settingMap['buyout_rate']) || 400
  const guestCapacity   = Number(settingMap['guest_capacity_per_set']) || 5
  const perPersonFee    = Number(settingMap['per_person_fee']) || 10
  const maxGuestsPerSet = Number(settingMap['max_guests_per_set']) || 7
  // Non-members pay a surcharge per set-hour; logged-in members pay the base rate.
  const guestSurchargePerHour = settingMap['guest_surcharge_per_hour'] != null
    ? Number(settingMap['guest_surcharge_per_hour']) : 10

  // 3. Normalize lines
  const rawLines: SetLine[] =
    body.type === 'studio'
      ? []
      : (Array.isArray(body.sets) && body.sets.length
          ? body.sets
          : (body.setSlug ? [{ setSlug: body.setSlug, date: body.date, startHour: body.startHour, endHour: body.endHour }] : []))

  if (body.type !== 'studio' && rawLines.length === 0) {
    return { ok: false, error: 'No sets selected.', status: 400 }
  }

  const lines: OrderLine[] = []
  if (body.type === 'studio') {
    lines.push({
      type: 'studio', setSlug: null, setId: null, setName: 'Full Studio Takeover',
      date: body.date, startHour: body.startHour, endHour: body.endHour,
      startISO: hoursToISO(body.date, body.startHour), endISO: hoursToISO(body.date, body.endHour),
      spaceDollars: buyoutRate * (body.endHour - body.startHour),
      stdSpaceDollars: buyoutRate * (body.endHour - body.startHour),
    })
  } else {
    for (const l of rawLines) {
      const setId = await getSetId(supabase, l.setSlug)
      if (!setId) return { ok: false, error: `Set not found: ${l.setSlug}`, status: 404 }
      const setName = SLUG_TO_NAME[l.setSlug] ?? l.setSlug
      const rate = setRateFor(l.setSlug, customerPricingOverrides)
      const rateStd = setRateFor(l.setSlug)
      lines.push({
        type: 'set', setSlug: l.setSlug, setId, setName,
        date: l.date, startHour: l.startHour, endHour: l.endHour,
        startISO: hoursToISO(l.date, l.startHour), endISO: hoursToISO(l.date, l.endHour),
        spaceDollars: rate * (l.endHour - l.startHour),
        stdSpaceDollars: rateStd * (l.endHour - l.startHour),
      })
    }
  }

  // 3b. Advance-booking window. Enforced here as well as in POST /api/bookings
  //     because this path also inserts booking rows (the delegated-payment
  //     hold), so skipping it would leave the hole open on a second door.
  //     `allowShortNotice` must be resolved by the CALLER from the verified
  //     session — never from body.email.
  if (!opts.allowShortNotice && violatesAdvanceWindow(lines.map(l => l.date))) {
    return { ok: false, error: ADVANCE_WINDOW_ERROR, status: 400 }
  }

  // ── One booking = one visit ──────────────────────────────────────────────
  //     ⚠️ A cart may hold several SETS but only ONE calendar date. Sets on
  //     different days are separate visits and must be separate bookings.
  //
  //     This is a DOOR-CODE safety rule, not a preference. The front-door
  //     algoPIN is minted once per booking from min(start) to max(end) across
  //     all lines — and an igloohome hourly algoPIN is valid CONTINUOUSLY for
  //     that whole window (it does not rotate; igloohome allows a single one to
  //     span 28 days). So a booking holding Aug 12 and Aug 20 would hand the
  //     customer one code that opens the shared warehouse for eight straight
  //     days, gaps included — and algoPINs CANNOT BE REVOKED.
  //
  //     Fixing it in the door layer instead would mean multiple codes per
  //     booking, which the confirmation email and SMS carry only one of; the
  //     guest on day two would arrive at a locked building. Preventing the
  //     shape is the change that cannot lock anyone out.
  const bookingDates = Array.from(new Set(lines.map(l => l.date)))
  if (bookingDates.length > 1) {
    return {
      ok: false,
      error: `A single booking has to be all on one day. You have sets on ${bookingDates.sort().join(' and ')} — please book each day separately.`,
      status: 400,
    }
  }

  //     Same rule, second half: one visit, not two visits in a day. See
  //     largestVisitGap() in lib/booking-times.ts for why this is a door-code
  //     constraint rather than a scheduling preference.
  const visitGap = largestVisitGap(lines)
  if (visitGap > VISIT_GAP_GRACE_HOURS) {
    return {
      ok: false,
      error: `Sets in one booking need to be part of the same visit, and this one has a ${visitGap}-hour gap. Please book the later set as a separate booking.`,
      status: 400,
    }
  }

  // 4. Minimum hours
  for (const l of lines) {
    const minH = l.type === 'studio' ? 4 : (SET_MIN_HOURS[l.setSlug ?? ''] ?? 1)
    if ((l.endHour - l.startHour) < minH) {
      return { ok: false, error: `${l.setName} requires a minimum ${minH}-hour booking.`, status: 400 }
    }
  }

  // 4b. Guests
  const guestCount = Math.max(0, Math.floor(Number(body.guests) || 0))
  let guestFeeDollars = 0
  if (body.type === 'studio') {
    if (guestCount > 30) {
      return { ok: false, error: 'Groups over 30 require approval — please text (832) 408-1631.', status: 400 }
    }
  } else if (guestCount > 0) {
    const minSetsPerWindow = guestCount <= maxGuestsPerSet ? 1 : Math.ceil(guestCount / guestCapacity)
    const wins: Record<string, { count: number; hours: number }> = {}
    for (const l of lines) {
      const k = `${l.date}|${l.startHour}|${l.endHour}`
      if (!wins[k]) wins[k] = { count: 0, hours: l.endHour - l.startHour }
      wins[k].count++
    }
    for (const k of Object.keys(wins)) {
      const w = wins[k]
      if (w.count < minSetsPerWindow) {
        return { ok: false, error: `${guestCount} guests need at least ${minSetsPerWindow} ${minSetsPerWindow === 1 ? 'set' : 'sets'} at each time (max ${guestCapacity} per set). Add another set or reduce your party.`, status: 400 }
      }
      const over = Math.max(0, guestCount - guestCapacity * w.count)
      if (over > 0) guestFeeDollars += over * perPersonFee * w.hours
    }
  }

  // 5. Equipment rates + inventory
  const equipIds = (body.equipment ?? []).map(l => l.equipment_id)
  const requested: Record<string, number> = {}
  for (const l of body.equipment ?? []) {
    requested[l.equipment_id] = (requested[l.equipment_id] ?? 0) + (l.quantity ?? 1)
  }
  const equipRates: Record<string, number> = {}
  if (equipIds.length) {
    const { data: equipRows } = await supabase.from('equipment').select('id, rate').in('id', equipIds)
    for (const e of equipRows ?? []) equipRates[e.id] = Number(e.rate)
    for (const l of lines) {
      const avail = await checkCartAvailability(supabase, l.startISO, l.endISO, requested)
      if (!avail.ok) {
        const conflicts = 'conflicts' in avail ? avail.conflicts : []
        const msg = conflicts.map(c => `${c.name} (requested ${c.requested}, ${c.available} free)`).join('; ')
        return { ok: false, error: `Some equipment isn't available for ${l.setName} on ${l.date}: ${msg}.`, status: 409 }
      }
    }
  }

  // 6. Set availability
  if (body.type !== 'studio') {
    const windows = lines.map(l => ({ setId: l.setId!, setName: l.setName, startISO: l.startISO, endISO: l.endISO }))
    const { ok, conflicts } = await checkSetWindows(supabase, windows)
    if (!ok) return { ok: false, error: conflicts.map(c => c.reason).join(' '), status: 409 }
  } else {
    // A buyout takes the whole floor, so it is checked against EVERY booking
    // rather than per set. ⚠️ This branch did not exist until 2026-08-21: the
    // guard was a bare `if (type !== 'studio')`, so a buyout skipped the
    // availability check altogether and could be sold over a floor full of
    // confirmed sessions. The set-booking direction was blind too — see the
    // note at the top of lib/set-availability.ts.
    const l = lines[0]
    const { ok, conflicts } = await checkBuyoutWindow(supabase, l.startISO, l.endISO)
    if (!ok) return { ok: false, error: conflicts.map(c => c.reason).join(' '), status: 409 }
  }

  // 6b. Non-member (guest) surcharge — per set-hour, members exempt. Studio
  //     buyouts are a flat rate and are not surcharged.
  const setHours = body.type === 'studio' ? 0 : lines.reduce((s, l) => s + (l.endHour - l.startHour), 0)
  const guestSurchargeDollars = opts.isMember ? 0 : guestSurchargePerHour * setHours

  // 7. Server-side price verification
  const equipCustom = equipmentDollars(body.equipment, equipRates, customerPricingOverrides)
  const equipStd    = equipmentDollars(body.equipment, equipRates)
  const spaceCustom = lines.reduce((s, l) => s + l.spaceDollars, 0)
  const spaceStd    = lines.reduce((s, l) => s + l.stdSpaceDollars, 0)
  const customCents   = Math.round((spaceCustom + equipCustom + guestFeeDollars + guestSurchargeDollars) * 100)
  const standardCents = Math.round((spaceStd + equipStd + guestFeeDollars + guestSurchargeDollars) * 100)
  const verifiedCents = customCents

  if (body.totalCents !== standardCents && body.totalCents !== customCents) {
    return { ok: false, error: `Price mismatch. Expected $${verifiedCents / 100}, received $${body.totalCents / 100}.`, status: 400 }
  }

  // 8. Ban check
  const primary = lines[0]
  if (body.email) {
    const { banned } = await checkBannedAndAlert(supabase, body.email, {
      customerEmail: body.email,
      setName:   lines.map(l => l.setName).join(', '),
      date:      formatDateLabel(primary.date),
      startTime: formatTimeLabel(primary.startHour),
      endTime:   formatTimeLabel(primary.endHour),
    })
    if (banned) {
      const { data: setting } = await supabase
        .from('studio_settings').select('value').eq('key', 'ban_message').maybeSingle()
      const banMessage = setting?.value
        ?? 'We were unable to process your booking. Please contact the studio directly at (832) 408-1631.'
      return { ok: false, error: banMessage, status: 403 }
    }
  }

  return {
    ok: true,
    order: { lines, verifiedCents, guestCount, guestFeeDollars, guestSurchargeDollars, equipRates, customerPricingOverrides, primary },
  }
}

// ─── finalizeBooking — door code + gcal + confirmations (route.ts 11b–13) ────
// Loads the (already-confirmed) booking rows by id and runs the same post-payment
// chain. Self-contained so it can be called from a *different* request than the
// one that created the rows (the payer's POST). All steps are non-fatal.

export async function finalizeBooking(
  supabase: SupabaseClient,
  bookingIds: string[]
): Promise<{ doorCode: string | null }> {
  const { data: rows } = await supabase
    .from('bookings')
    .select('id, start_time, end_time, notes, guest_count, total_amount, check_in_token, gcal_event_id, set_id, sets(name), customers(name, email, phone)')
    .in('id', bookingIds)

  if (!rows || rows.length === 0) return { doorCode: null }

  const first: any = rows[0]
  const customer = Array.isArray(first.customers) ? first.customers[0] : first.customers
  const custName  = customer?.name ?? 'Guest'
  const custEmail = customer?.email as string | undefined
  const custPhone = customer?.phone as string | undefined
  const notes     = first.notes as string | undefined
  const guestCount = first.guest_count as number | null

  const setNameOf = (r: any) => {
    const s = Array.isArray(r.sets) ? r.sets[0] : r.sets
    return s?.name ?? 'Full Studio Takeover'
  }

  // ⚠️ These come straight from Supabase, which returns timestamptz in UTC —
  // an 11 PM Central booking arrives as `...T04:00:00+00:00` on the NEXT day.
  // Reading them positionally (as this did until 2026-08-09) put the wrong time
  // AND the wrong date into every delegated-payment confirmation.
  const lineFor = (r: any) => ({
    setName:   setNameOf(r),
    date:      centralDateStr(r.start_time),
    startHour: centralHourDecimal(r.start_time),
    endHour:   centralHourDecimal(r.end_time),
    startISO:  r.start_time as string,
    endISO:    r.end_time as string,
  })
  const lines = rows.map(lineFor)
  const primary = lines[0]

  // Party-size wording quotes the SET capacity, which lives in studio_settings
  // and can be changed without a deploy — don't hardcode 5 here. A full-studio
  // buyout (every row has set_id null) has no per-set number to quote.
  const isBuyout = (rows as any[]).every(r => r.set_id == null)
  let guestCapacity: number | null = null
  if (!isBuyout) {
    const { data: capRow } = await supabase
      .from('studio_settings').select('value').eq('key', 'guest_capacity_per_set').maybeSingle()
    guestCapacity = Number(capRow?.value) || 5
  }
  const totalAmount = rows.reduce((s: number, r: any) => s + Number(r.total_amount ?? 0), 0)

  // Door code across the whole window — front door, plus the back door when a
  // back-door lock is configured (distinct algoPIN per lock).
  let doorCode: string | null = null
  let doorCodeBack: string | null = null
  try {
    const startMs = Math.min(...lines.map(l => Date.parse(l.startISO)))
    const endMs   = Math.max(...lines.map(l => Date.parse(l.endISO)))
    const winStart = new Date(startMs).toISOString()
    const winEnd   = new Date(endMs).toISOString()
    const pin     = await createBookingPin({ startISO: winStart, endISO: winEnd, accessName: `MK ${custName} ${primary.date}`.slice(0, 40) })
    if (pin) {
      doorCode = pin.pin
      await supabase.from('bookings').update({ door_code: pin.pin, door_code_pin_id: pin.pinId }).in('id', bookingIds)
    }
    // Back door written separately — a missing back-door column (migration 081
    // not yet run) can never roll back the front-door code above.
    const pinBack = await createBackDoorPin({ startISO: winStart, endISO: winEnd, accessName: `MK ${custName} ${primary.date} back`.slice(0, 40) })
    if (pinBack) {
      doorCodeBack = pinBack.pin
      await supabase.from('bookings').update({ door_code_back: pinBack.pin, door_code_back_pin_id: pinBack.pinId }).in('id', bookingIds)
    }
  } catch (err) {
    console.error('[finalize] door code error (non-fatal):', err)
  }

  // Google Calendar (per row, gated on toggle).
  try {
    if (await gcalSyncEnabled(supabase)) {
      for (const r of rows as any[]) {
        if (r.gcal_event_id) continue
        const l = lineFor(r)
        const eventId = await createCalendarEvent({
          summary: `${l.setName} — ${custName}`,
          description: [
            `Booking ${r.id}`,
            `${custName}${custEmail ? ` · ${custEmail}` : ''}${custPhone ? ` · ${custPhone}` : ''}`,
            ...(guestCount ? [`Guests: ${guestCount}`] : []),
            ...(notes ? [`Notes: ${notes}`] : []),
          ].join('\n'),
          location: STUDIO_ADDRESS,
          startISO: l.startISO,
          endISO: l.endISO,
        }).catch(err => { console.error('[finalize] gcal event error:', err); return null })
        if (eventId) await supabase.from('bookings').update({ gcal_event_id: eventId }).eq('id', r.id)
      }
    }
  } catch (err) {
    console.error('[finalize] gcal sync error (non-fatal):', err)
  }

  // Confirmations to the BOOKER (person running the shoot) + owner.
  const notifications: Promise<any>[] = []

  if (custPhone) {
    const dollars = totalAmount.toFixed(2)
    const sched = lines.map(l => `📍 ${l.setName} — ${l.date} ${fmt12(l.startHour)}–${fmt12(l.endHour)}`).join('\n')
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app'
    const checkInLine = first.check_in_token ? `📲 Check in when you arrive: ${appUrl}/checkin/${first.check_in_token}` : null
    const doorDisplay = doorCode ? doorCode.replace(/(\d{3})(?=\d)/g, '$1 ') : null
    const doorBackDisplay = doorCodeBack ? doorCodeBack.replace(/(\d{3})(?=\d)/g, '$1 ') : null
    const codeLines = [
      doorCode ? `🔑 Front-door code: ${doorDisplay}` : null,
      doorCodeBack ? `🔑 Back-door code: ${doorBackDisplay}` : null,
    ].filter(Boolean) as string[]
    if (codeLines.length) codeLines.push(DOOR_CODE_HOWTO, '(your codes are for this session only)')
    const arrivalLine = '⏰ No early arrivals. No studio access before your booked time.'
    const guestLine = guestCount ? `👥 ${formatGuestLine(guestCount, guestCapacity)}` : null
    const message = [
      `✅ Made Kulture — Booking Confirmed!`, ``,
      `${custName}, you're locked in.`, sched,
      ...(guestLine ? [guestLine] : []),
      `💳 $${dollars} paid`,
      ...(codeLines.length ? ['', ...codeLines] : []),
      ``, arrivalLine,
      ...(checkInLine ? [``, checkInLine] : []),
      ``, `4825 Gulf Freeway, Houston TX 77023`,
      `Questions? Text (832) 408-1631.`, `Reply STOP to opt out.`,
    ].join('\n')
    // Pass the raw phone: sendSMS normalises via toE164, which REJECTS an
    // unusable number. Pre-wrapping in normalizePhone turns garbage into
    // '+<digits>', which toE164 then waves through to Twilio.
    notifications.push(sendSMS(custPhone, message).catch(err => console.error('[finalize] SMS error:', err)))
  }

  if (custEmail) {
    const scheduleLines = lines.length > 1
      ? lines.map(l => `${l.setName} — ${formatDateLabel(l.date)}, ${formatTimeLabel(l.startHour)} – ${formatTimeLabel(l.endHour)}`)
      : undefined
    notifications.push(
      sendBookingConfirmation({
        customerName: custName, customerEmail: custEmail,
        setName: lines.map(l => l.setName).join(', '),
        date: formatDateLabel(primary.date),
        startTime: formatTimeLabel(primary.startHour),
        endTime: formatTimeLabel(primary.endHour),
        totalAmount, bookingId: first.id,
        notes: notes || undefined, scheduleLines,
        guestCount: guestCount || undefined,
        guestCapacity: guestCapacity ?? undefined,
        doorCode: doorCode || undefined,
        doorCodeBack: doorCodeBack || undefined,
        startISO: primary.startISO, endISO: primary.endISO,
        checkInToken: first.check_in_token || undefined,
      } as any).catch((err: any) => console.error('[finalize] email confirm error:', err)),
      sendNewBookingAlert({
        customerName: custName, customerEmail: custEmail, customerPhone: custPhone,
        setName: lines.map(l => l.setName).join(', '),
        date: formatDateLabel(primary.date),
        startTime: formatTimeLabel(primary.startHour),
        endTime: formatTimeLabel(primary.endHour),
        totalAmount, bookingId: first.id,
        source: 'website', notes: notes || undefined, scheduleLines,
      } as any).catch((err: any) => console.error('[finalize] email alert error:', err)),
    )
  }

  notifications.push(
    sendOwnerPush({
      title: '🎉 Booking confirmed',
      body: `${custName} — ${lines.map(l => l.setName).join(', ')} · ${formatDateLabel(primary.date)} ${formatTimeLabel(primary.startHour)}`,
      url: '/admin/dashboard',
    }).catch(() => {})
  )

  await Promise.allSettled(notifications)
  return { doorCode }
}

// ─── shortNoticeQuoteCents — the ONE price a short-notice request speaks ─────
// The figure is SHOWN to the customer at consent and CHARGED at approval, so
// both have to come from here. A browser-computed price would let the two
// disagree, and the one they agreed to is the only defensible number to take.
//
// A short-notice request is always a single set, at the member rate (they are
// signed in to make it), with no equipment and no extra guests — so this is
// exactly what validateAndPriceOrder computes for the same order. That is not a
// coincidence to preserve loosely: it is what makes the price check at approval
// pass instead of 400ing on a mismatch.
export function shortNoticeQuoteCents(slug: string, hours: number, pricingOverrides?: any): number {
  return Math.round(setRateFor(slug, pricingOverrides) * hours * 100)
}

// ─── insertBookingRows — the shared row writer ───────────────────────────────
// Lifted out of /api/bookings/delegate so the short-notice auto-pay path does
// not become a THIRD place that knows how to write a booking. The two that
// already exist have drifted before (see the price-verification comments
// above), and a third would drift the same way.
//
// Writes one row per priced line. The FIRST row carries the whole order's
// equipment, guest fee and guest surcharge — the others carry only their own
// space cost — so summing total_amount across the order_group gives the order
// total exactly once.
//
// ⚠️ On a failed insert this rolls back the rows it already wrote. A half-held
// order is worse than no hold: it blocks a set nobody is going to pay for.
export interface InsertRowsOptions {
  status:     'pending_payment' | 'confirmed'
  source:     string
  customerId: string | null
  authUserId: string | null
  notes?:     string | null
  equipment?: { equipment_id: string; quantity: number }[]
  orderGroup?: string
  squareCardOnFileId?: string | null
  squarePaymentId?: string | null
}

export type InsertRowsResult =
  | { ok: true;  bookingIds: string[]; orderGroup: string }
  | { ok: false; error: string }

export async function insertBookingRows(
  supabase: SupabaseClient,
  order: PricedOrder,
  opts: InsertRowsOptions
): Promise<InsertRowsResult> {
  const { lines, guestCount, guestFeeDollars, guestSurchargeDollars, equipRates } = order
  const orderGroup = opts.orderGroup ?? randomUUID()
  const equipment  = opts.equipment ?? []
  const equipTotal = equipment.reduce(
    (sum, l) => sum + (equipRates[l.equipment_id] ?? 0) * (l.quantity ?? 1), 0)

  const bookingIds: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const rowTotal = l.spaceDollars + (i === 0 ? equipTotal + guestFeeDollars + guestSurchargeDollars : 0)
    const { data: row, error: insErr } = await supabase
      .from('bookings')
      .insert({
        set_id:           l.setId,
        customer_id:      opts.customerId,
        auth_user_id:     opts.authUserId,
        start_time:       l.startISO,
        end_time:         l.endISO,
        status:           opts.status,
        base_amount:      l.spaceDollars,
        extras_amount:    i === 0 ? equipTotal : 0,
        total_amount:     rowTotal,
        guest_count:      guestCount || null,
        guest_fee_amount: i === 0 ? guestFeeDollars : 0,
        order_group:      orderGroup,
        source:           opts.source,
        notes:            opts.notes ?? null,
        ...(opts.squareCardOnFileId ? { square_card_on_file_id: opts.squareCardOnFileId } : {}),
        ...(opts.squarePaymentId    ? { square_payment_id:      opts.squarePaymentId }    : {}),
      })
      .select('id').single()

    // ⚠️ supabase-js does NOT throw on a Postgres error — without reading
    // `error` this loop would happily "succeed" having written nothing.
    if (insErr) {
      console.error('[insertBookingRows] booking insert error:', insErr)
      if (bookingIds.length) await supabase.from('bookings').delete().in('id', bookingIds)
      return { ok: false, error: 'Could not hold the slot — please try again.' }
    }
    if (row?.id) {
      bookingIds.push(row.id)
      if (i === 0 && equipment.length > 0) {
        const addons = equipment.map(e => ({
          booking_id: row.id, equipment_id: e.equipment_id,
          quantity: e.quantity, rate: equipRates[e.equipment_id] ?? 0,
          // Paid state follows the booking: a confirmed order is paid, a hold
          // is not. The Square webhook flips holds when the link is paid.
          paid: opts.status === 'confirmed',
        }))
        const { error: addErr } = await supabase.from('booking_add_ons').insert(addons)
        if (addErr) console.error('[insertBookingRows] add-on insert error:', addErr)
      }
    }
  }

  if (bookingIds.length === 0) {
    return { ok: false, error: 'Could not hold the slot — please try again.' }
  }
  return { ok: true, bookingIds, orderGroup }
}
