// Shared booking logic used by both the delegated-payment flow
// (/api/bookings/delegate + /api/pay/[token]) and — eventually — the main
// checkout route. Mirrors the pre-charge validation (steps 1–8) and the
// post-payment finalize chain (door code + gcal + confirmations) of
// POST /api/bookings so all payment paths behave identically.
//
// NOTE: the live POST /api/bookings still inlines its own copies of this logic.
// Rewiring it to import from here is a safe follow-up once the delegated flow is
// verified — until then, keep the two in sync if you touch pricing/guest rules.

import type { SupabaseClient } from '@supabase/supabase-js'
import { sendBookingConfirmation, sendNewBookingAlert, formatTimeLabel, formatDateLabel } from '@/lib/email'
import { checkBannedAndAlert } from '@/lib/flagged-customer'
import { checkCartAvailability } from '@/lib/equipment-availability'
import { checkSetWindows } from '@/lib/set-availability'
import { createBookingPin } from '@/lib/igloohome'
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

const SET_MIN_HOURS: Record<string, number> = { 'watering-hole': 2, 'the-tank': 2 }

function setRateFor(slug: string, pricingOverrides?: any): number {
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
  const hour = Math.floor(h)
  const mins = h % 1 !== 0 ? '30' : '00'
  return `${date}T${String(hour).padStart(2, '0')}:${mins}:00-05:00`
}

// Inverse of hoursToISO — safe because we control the stored format.
function isoToHour(iso: string): number {
  const hh = Number(iso.slice(11, 13))
  const mm = iso.slice(14, 16)
  return hh + (mm === '30' ? 0.5 : 0)
}

export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return `+${digits}`
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
  body: BookingCoreInput
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
    .in('key', ['buyout_rate', 'guest_capacity_per_set', 'per_person_fee', 'max_guests_per_set'])
  const settingMap: Record<string, string> = {}
  for (const s of settingRows ?? []) settingMap[s.key] = s.value
  const buyoutRate      = Number(settingMap['buyout_rate']) || 400
  const guestCapacity   = Number(settingMap['guest_capacity_per_set']) || 5
  const perPersonFee    = Number(settingMap['per_person_fee']) || 10
  const maxGuestsPerSet = Number(settingMap['max_guests_per_set']) || 7

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
  }

  // 7. Server-side price verification
  const equipCustom = equipmentDollars(body.equipment, equipRates, customerPricingOverrides)
  const equipStd    = equipmentDollars(body.equipment, equipRates)
  const spaceCustom = lines.reduce((s, l) => s + l.spaceDollars, 0)
  const spaceStd    = lines.reduce((s, l) => s + l.stdSpaceDollars, 0)
  const customCents   = Math.round((spaceCustom + equipCustom + guestFeeDollars) * 100)
  const standardCents = Math.round((spaceStd + equipStd + guestFeeDollars) * 100)
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
    order: { lines, verifiedCents, guestCount, guestFeeDollars, equipRates, customerPricingOverrides, primary },
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

  const lineFor = (r: any) => ({
    setName:   setNameOf(r),
    date:      String(r.start_time).slice(0, 10),
    startHour: isoToHour(r.start_time),
    endHour:   isoToHour(r.end_time),
    startISO:  r.start_time as string,
    endISO:    r.end_time as string,
  })
  const lines = rows.map(lineFor)
  const primary = lines[0]
  const totalAmount = rows.reduce((s: number, r: any) => s + Number(r.total_amount ?? 0), 0)

  // Door code across the whole window.
  let doorCode: string | null = null
  try {
    const startMs = Math.min(...lines.map(l => Date.parse(l.startISO)))
    const endMs   = Math.max(...lines.map(l => Date.parse(l.endISO)))
    const pin = await createBookingPin({
      startISO: new Date(startMs).toISOString(),
      endISO:   new Date(endMs).toISOString(),
      accessName: `MK ${custName} ${primary.date}`.slice(0, 40),
    })
    if (pin) {
      doorCode = pin.pin
      await supabase.from('bookings')
        .update({ door_code: pin.pin, door_code_pin_id: pin.pinId })
        .in('id', bookingIds)
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
    const doorLine = doorCode ? `🔑 Front-door code: ${doorDisplay} (works during your booked time only)` : null
    const guestLine = guestCount ? `👥 ${guestCount} guests — this is your booked limit` : null
    const message = [
      `✅ Made Kulture — Booking Confirmed!`, ``,
      `${custName}, you're locked in.`, sched,
      ...(guestLine ? [guestLine] : []),
      `💳 $${dollars} paid`,
      ...(doorLine ? [``, doorLine] : []),
      ...(checkInLine ? [``, checkInLine] : []),
      ``, `4825 Gulf Freeway, Houston TX 77023`,
      `Questions? Text or call (832) 408-1631.`, `Reply STOP to opt out.`,
    ].join('\n')
    notifications.push(sendSMS(normalizePhone(custPhone), message).catch(err => console.error('[finalize] SMS error:', err)))
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
        doorCode: doorCode || undefined,
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
      title: '🎉 Booking confirmed (delegated pay)',
      body: `${custName} — ${lines.map(l => l.setName).join(', ')} · ${formatDateLabel(primary.date)} ${formatTimeLabel(primary.startHour)}`,
      url: '/admin/dashboard',
    }).catch(() => {})
  )

  await Promise.allSettled(notifications)
  return { doorCode }
}
