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
import { createBookingPin, createBackDoorPin, doorCodeLinkLine } from '@/lib/igloohome'
import { largestVisitGap, VISIT_GAP_GRACE_HOURS, bookingHourToISO, centralDateStr, centralHourDecimal, confirmTextAtBooking } from '@/lib/booking-times'
import { createCalendarEvent, gcalSyncEnabled } from '@/lib/gcal'
import { STUDIO_ADDRESS } from '@/lib/calendar'
import { sendSMS } from '@/lib/sms'
import { sendOwnerPush, pushNote } from '@/lib/push'
import { pushVisitLine } from '@/lib/visits'
import { rewardRateForEmail } from '@/lib/rewards'
import { standingForEmail, PROBATION_BOOKING_ERROR } from '@/lib/standing'
import { screenBooking } from '@/lib/identity-match'
import { guestSharesByLine } from '@/lib/guest-rate'
import { loadSetCatalog, catalogRate, catalogMinHours, type SetCatalog } from '@/lib/set-catalog'
import { dropContextForCheckout } from '@/lib/set-drops-server'

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
  /** Per-row shares of the two above (lib/guest-rate guestSharesByLine). */
  guestFeeByLine: number[]
  guestSurchargeByLine: number[]
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

// ⚠️ SET RATES AND MINIMUMS NOW COME FROM THE `sets` TABLE — lib/set-catalog.ts.
// SLUG_TO_NAME above stays only for the PHYSICAL tablets (kiosk links, June's
// kiosk mode, /t/ short codes): those are tied to rooms that have hardware.

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

// ─── validateAndPriceOrder — pre-charge checks (mirrors route.ts steps 1–8) ──

export type ValidateResult =
  | { ok: true; order: PricedOrder }
  | { ok: false; error: string; status: number }

export async function validateAndPriceOrder(
  supabase: SupabaseClient,
  body: BookingCoreInput,
  opts: { isMember?: boolean; allowShortNotice?: boolean; approved?: boolean; payerContacts?: string[]; sharedFloor?: boolean; pricingEmail?: string | null } = {}
): Promise<ValidateResult> {
  // 1. Customer pricing overrides — ⚠️ 2026-10-06: looked up by `pricingEmail`,
  //    which callers set from a VERIFIED identity (the session, or an owner-
  //    approved request), never from the typed email. Anyone who knew a comped
  //    customer's address used to book at their rate (comp_no_card = no card).
  let customerPricingOverrides: any = null
  const pricingEmail = String(opts.pricingEmail ?? '').toLowerCase().trim()
  if (pricingEmail) {
    const { data: custPricing } = await supabase
      .from('customers').select('pricing_overrides')
      .eq('email', pricingEmail).maybeSingle()
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

  const catalog = await loadSetCatalog(supabase)
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
      const cs = catalog.bySlug[l.setSlug]
      if (!cs || !cs.isActive) return { ok: false, error: `Set not found: ${l.setSlug}`, status: 404 }
      const setId = cs.id
      const setName = cs.name
      const rate = catalogRate(catalog, l.setSlug, customerPricingOverrides)
      const rateStd = catalogRate(catalog, l.setSlug)
      lines.push({
        type: 'set', setSlug: l.setSlug, setId, setName,
        date: l.date, startHour: l.startHour, endHour: l.endHour,
        startISO: hoursToISO(l.date, l.startHour), endISO: hoursToISO(l.date, l.endHour),
        spaceDollars: rate * (l.endHour - l.startHour),
        stdSpaceDollars: rateStd * (l.endHour - l.startHour),
      })
    }
  }

  // 3a. Set Drops (migration 155): early access + the depositor rate, the same
  //     rules POST /api/bookings applies. Identity = pricingEmail (callers set
  //     it from a verified identity); the pledge row carries the account id.
  if (body.type !== 'studio') {
    let authId: string | null = null
    if (pricingEmail) {
      const { data: pl, error: plErr } = await supabase.from('set_drop_pledges')
        .select('auth_user_id').eq('customer_email', pricingEmail).neq('status', 'refunded').limit(1)
      if (plErr && !/does not exist|schema cache/i.test(plErr.message)) throw new Error(`pledge lookup failed: ${plErr.message}`)
      authId = (pl?.[0] as any)?.auth_user_id ?? null
    }
    const dropCtx = await dropContextForCheckout(supabase, authId, lines.map(l => l.setId))
    for (const l of lines) {
      const c = l.setId ? dropCtx.get(l.setId) : undefined
      if (!c) continue
      if (c.blocked) return { ok: false, error: c.blocked, status: 403 }
      const hrs = l.endHour - l.startHour
      if (c.depositorRate != null && hrs > 0 && c.depositorRate < l.spaceDollars / hrs) {
        l.spaceDollars = Math.round(c.depositorRate * hrs * 100) / 100
      }
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
    const minH = l.type === 'studio' ? 4 : catalogMinHours(catalog, l.setSlug)
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
    // sharedFloor = a studio-approved takeover that runs alongside the set
    // bookings already there; only another buyout can block it.
    const { ok, conflicts } = await checkBuyoutWindow(supabase, l.startISO, l.endISO, undefined, { buyoutsOnly: !!opts.sharedFloor })
    if (!ok) return { ok: false, error: opts.sharedFloor ? 'Another full-warehouse takeover is already booked during that window.' : conflicts.map(c => c.reason).join(' '), status: 409 }
  }

  // 6b. Non-member (guest) surcharge — per set-hour, members exempt. Studio
  //     buyouts are a flat rate and are not surcharged.
  const setHours = body.type === 'studio' ? 0 : lines.reduce((s, l) => s + (l.endHour - l.startHour), 0)
  const guestSurchargeDollars = opts.isMember ? 0 : guestSurchargePerHour * setHours
  // Each row carries its OWN share (2026-10-08) — see guestSharesByLine.
  const shares = guestSharesByLine(lines, {
    guestCount, capacity: guestCapacity, perPersonFee, feeTotal: guestFeeDollars,
    surchargePerHour: opts.isMember ? 0 : guestSurchargePerHour, surchargeTotal: guestSurchargeDollars,
    isStudio: body.type === 'studio',
  })

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
    // Probation (migration 109): only an APPROVED request may book. The approval
    // route passes approved:true; every other caller is gated here.
    if (!opts.approved && (await standingForEmail(supabase, body.email)).level === 'probation') {
      return { ok: false, error: PROBATION_BOOKING_ERROR, status: 403 }
    }
    // Suspended customer under new details — or a friend paying for one
    // (migration 113, lib/identity-match). Strong match blocks before payment.
    {
      const { data: own } = await supabase.from('customers').select('id').eq('email', String(body.email).toLowerCase().trim())
      const screen = await screenBooking(supabase, {
        emails: [body.email], phones: [body.phone], name: body.name, payerContacts: opts.payerContacts ?? [],
        excludeIds: (own ?? []).map((r: any) => r.id),
        where: opts.approved ? 'request approval' : 'someone-else-pays checkout',
        bookerLabel: `${body.name || 'Someone'} · ${body.email}`,
      })
      if (screen.block) {
        const { data: setting } = await supabase.from('studio_settings').select('value').eq('key', 'ban_message').maybeSingle()
        return { ok: false, error: setting?.value ?? 'We were unable to process your booking. Please contact the studio directly at (832) 408-1631.', status: 403 }
      }
    }
  }

  return {
    ok: true,
    order: { lines, verifiedCents, guestCount, guestFeeDollars, guestSurchargeDollars, guestFeeByLine: shares.fee, guestSurchargeByLine: shares.surcharge, equipRates, customerPricingOverrides, primary },
  }
}

// ─── finalizeBooking — door code + gcal + confirmations (route.ts 11b–13) ────
// Loads the (already-confirmed) booking rows by id and runs the same post-payment
// chain. Self-contained so it can be called from a *different* request than the
// one that created the rows (the payer's POST). All steps are non-fatal.

export async function finalizeBooking(
  supabase: SupabaseClient,
  bookingIds: string[],
  opts: { forceText?: boolean } = {},
): Promise<{ doorCode: string | null }> {
  const { data: rows } = await supabase
    .from('bookings')
    .select('id, start_time, end_time, notes, guest_count, total_amount, check_in_token, manage_token, gcal_event_id, set_id, customer_id, sets(name), customers(name, email, phone)')
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

  // Email-first (2026-10-02): text now only if the day-before reminder won't
  // catch this session, or the owner explicitly resends the confirmation.
  const earliestStart = rows.map((r: any) => r.start_time as string).sort((a, b) => Date.parse(a) - Date.parse(b))[0]
  if (custPhone && (opts.forceText || confirmTextAtBooking(earliestStart))) {
    const dollars = totalAmount.toFixed(2)
    const sched = lines.map(l => `📍 ${l.setName} — ${l.date} ${fmt12(l.startHour)}–${fmt12(l.endHour)}`).join('\n')
    // The code itself is NOT texted (2026-10-01) — it appears on the check-in
    // page when the guest taps CHECK IN at the studio. One line, shared.
    const codeLines = (doorCode || doorCodeBack) ? [doorCodeLinkLine(first.check_in_token)] : []
    const checkInLine = null
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
        // doorCode is deliberately NOT passed — the email points at the check-in page.
        hasDoorCode: !!(doorCode || doorCodeBack),
        startISO: primary.startISO, endISO: primary.endISO,
        checkInToken: first.check_in_token || undefined,
        // The guest's way back to this booking — see migration 101. Delegated
        // and short-notice bookings come through here, not through the inline
        // copy in app/api/bookings, so both paths have to pass it.
        manageToken: first.manage_token || undefined,
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

  const visitLine = await pushVisitLine(supabase, (first as any).customer_id, bookingIds)
  notifications.push(
    sendOwnerPush({
      title: '🎉 Booking confirmed',
      // The checkout note rides along (2026-09-26) — it used to reach only the email
      // and the expanded admin row, and a "white wall on Set C" request was missed.
      body: `${custName} — ${lines.map(l => l.setName).join(', ')} · ${formatDateLabel(primary.date)} ${formatTimeLabel(primary.startHour)}${visitLine}${pushNote(notes)}`,
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
export function shortNoticeQuoteCents(catalog: SetCatalog, slug: string, hours: number, pricingOverrides?: any): number {
  return Math.round(catalogRate(catalog, slug, pricingOverrides) * hours * 100)
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
  // Made Kulture Rewards (migration 109): the ACCOUNT's email when this booking
  // should earn. Omit for anything a third party pays for (delegate / pay link).
  // These paths apply no promo and no credit, so the basis is the full set time
  // + gear on each row.
  rewardEmail?: string | null
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
  // Older callers may hand in an order without per-row shares: bank on row 0.
  const feeByLine = order.guestFeeByLine ?? lines.map((_, i) => (i === 0 ? guestFeeDollars : 0))
  const surByLine = order.guestSurchargeByLine ?? lines.map((_, i) => (i === 0 ? guestSurchargeDollars : 0))
  const orderGroup = opts.orderGroup ?? randomUUID()
  const equipment  = opts.equipment ?? []
  const equipTotal = equipment.reduce(
    (sum, l) => sum + (equipRates[l.equipment_id] ?? 0) * (l.quantity ?? 1), 0)

  let rewardRate: number | null = null
  if (opts.rewardEmail) {
    try { rewardRate = await rewardRateForEmail(supabase, opts.rewardEmail) }
    catch (e) { console.error('[insertBookingRows] reward rate lookup failed (non-fatal)', e) }
  }

  const bookingIds: string[] = []
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i]
    const rowTotal = l.spaceDollars + (i === 0 ? equipTotal : 0) + feeByLine[i] + surByLine[i]
    const rewardBasis = Math.round((l.spaceDollars + (i === 0 ? equipTotal : 0)) * 100)
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
        // Sold hourly set rate (migration 154) — see lib/guest-rate effectiveHourlyRate.
        hourly_rate:      (l.endHour - l.startHour) > 0 ? Math.round((l.spaceDollars / (l.endHour - l.startHour)) * 100) / 100 : null,
        extras_amount:    i === 0 ? equipTotal : 0,
        total_amount:     rowTotal,
        guest_count:      guestCount || null,
        guest_fee_amount: feeByLine[i],
        // The non-member surcharge, recorded instead of vanishing into
        // total_amount. Everything that later re-derives a price for this
        // booking (extensions, the admin edit modal) reads it to work out what
        // the customer's real hourly rate was — without it they all fell back
        // to the member rate and undercharged. Migration 100.
        // Since 2026-10-08 each row carries its own share (it used to be banked
        // on the first row, which made add-time price siblings wrong).
        guest_surcharge_amount: surByLine[i],
        order_group:      orderGroup,
        source:           opts.source,
        notes:            opts.notes ?? null,
        ...(opts.squareCardOnFileId ? { square_card_on_file_id: opts.squareCardOnFileId } : {}),
        ...(opts.squarePaymentId    ? { square_payment_id:      opts.squarePaymentId }    : {}),
        ...(rewardRate != null      ? { reward_rate: rewardRate, reward_basis_cents: rewardBasis } : {}),
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
