// Session-extension planning — shared by June's kiosk tool, the wrap-up cron,
// the admin overtime tools and the customer confirm endpoint. Mirrors the
// pricing/conflict logic of the staff add-time route (per-customer overrides
// included) so every path prices identically.
//
// TWO KINDS, and the difference matters:
//   • 'extend'  — buying time that hasn't happened yet. end_time moves forward,
//                 so a booking on the set right after is a hard blocker.
//   • 'overage' — time the guest ALREADY used. Charged, but end_time must NOT
//                 move: the set is often booked right behind them, which is
//                 precisely the case where running over cost somebody something.

import { supabaseAdmin } from '@/lib/supabase'
import { bookingHourToISO, centralDateStr, centralHourDecimal } from '@/lib/booking-times'
import { randomUUID } from 'crypto'

export type ExtensionKind = 'extend' | 'overage'

const RATE_BY_NAME: Record<string, number> = {
  'Set A': 40, 'Set B': 40, 'Set C': 40, 'Set D': 40,
  'Concrete': 40, 'Vintage': 40, 'Cottage': 40,
  'The Watering Hole': 75, 'The Tank': 75, 'Studio One': 65,
}
const SLUG_BY_NAME: Record<string, string> = {
  'Set A': 'set-a', 'Set B': 'set-b', 'Set C': 'set-c', 'Set D': 'set-d',
  'Concrete': 'concrete', 'Vintage': 'vintage', 'Cottage': 'cottage',
  'The Watering Hole': 'watering-hole', 'The Tank': 'the-tank', 'Studio One': 'studio-one',
}

function rateFor(setName: string | undefined, overrides: any): number {
  if (!setName) return 0
  let rate = RATE_BY_NAME[setName] ?? 0
  if (overrides) {
    const slug = SLUG_BY_NAME[setName]
    const perSet = slug ? overrides.sets?.[slug] : undefined
    if (perSet != null) rate = Number(perSet)
    else if (overrides.hourly_rate != null) rate = Number(overrides.hourly_rate)
  }
  return rate
}

// "30 minutes" / "1 hour" / "1 hr 30 min" / "2 hours" — used in every SMS and on
// the confirm page, so a half-hour never reads as "+0.5 hours".
export function durationLabel(hours: number): string {
  const mins = Math.round(hours * 60)
  if (mins < 60) return `${mins} minutes`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (m === 0) return `${h} hour${h > 1 ? 's' : ''}`
  return `${h} hr ${m} min`
}

// Half-hour granularity, floor of 30 min, ceiling of 12 hrs. Everything that
// accepts a duration from outside goes through this.
export function normalizeHours(raw: unknown): number | null {
  const n = Number(raw)
  if (!Number.isFinite(n)) return null
  const rounded = Math.round(n * 2) / 2
  if (rounded < 0.5 || rounded > 12) return null
  return rounded
}

const SELECT = `
  id, start_time, end_time, status, set_id, total_amount, customer_id, auth_user_id, gcal_event_id,
  square_card_on_file_id, door_code, door_code_back, checked_out_at,
  sets ( name ),
  customers ( name, email, phone, square_customer_id, pricing_overrides )
`

export interface ExtensionPlan {
  booking: any
  kind: ExtensionKind
  setName: string
  customerName: string
  customerPhone: string | null
  customerEmail: string | null
  rate: number
  priceCents: number
  newEndISO: string
  conflict: boolean
  hasCardOnFile: boolean
}

export async function planExtension(
  bookingId: string,
  hours: number,
  kind: ExtensionKind = 'extend',
): Promise<ExtensionPlan | { error: string }> {
  const db = supabaseAdmin()
  const { data: b } = await db.from('bookings').select(SELECT).eq('id', bookingId).maybeSingle()
  if (!b) return { error: 'Booking not found.' }
  // An extension buys future time, so the booking has to be live. An overage is
  // billed after the fact — the only disqualifier is a cancelled booking.
  if (kind === 'extend' && b.status !== 'confirmed') return { error: 'This booking is not active.' }
  if (kind === 'overage' && b.status === 'cancelled') return { error: 'This booking was cancelled.' }

  const setName = (b.sets as any)?.name as string | undefined
  const customer = b.customers as any
  if (!b.set_id || !setName) return { error: 'Full-studio buyouts are extended by the team — tap GET THE TEAM or text (832) 408-1631.' }

  const rate = rateFor(setName, customer?.pricing_overrides)
  if (!rate) return { error: `No hourly rate found for ${setName}.` }

  const priceCents = Math.round(rate * hours * 100)
  const curEnd = new Date(b.end_time)
  const newEnd = new Date(curEnd.getTime() + hours * 3600_000)

  // Only meaningful for 'extend' — an overage never moves the window, so it
  // can't collide with anything. Computed either way for the caller's display.
  const { data: clash } = await db
    .from('bookings')
    .select('id')
    .eq('set_id', b.set_id)
    .neq('status', 'cancelled')
    .neq('id', bookingId)
    .lt('start_time', newEnd.toISOString())
    .gt('end_time', curEnd.toISOString())
    .limit(1)

  return {
    booking: b,
    kind,
    setName,
    customerName: customer?.name ?? 'Guest',
    customerPhone: customer?.phone ?? null,
    customerEmail: customer?.email ?? null,
    rate,
    priceCents,
    newEndISO: newEnd.toISOString(),
    conflict: kind === 'extend' && !!(clash && clash.length),
    // Optimistic: a Square customer profile can hold saved cards even when this
    // particular booking wasn't paid with one. The confirm endpoint resolves the
    // actual card (booking's card → else customer's saved cards) before charging.
    hasCardOnFile: !!customer?.square_customer_id,
  }
}

export interface CreateExtensionOpts {
  // Link lifetime. June's kiosk flow uses a tight 15 min because the guest is
  // standing right there; the wrap-up text needs longer (it arrives 15 min
  // before the session ends and the guest is mid-pack-up); an admin overtime
  // charge gets longer still, since the guest has already left the building.
  ttlMs?: number
  kind?: ExtensionKind
  // When false (the automated paths), a booking with no card on file can't be
  // offered an extension at all. When true (admin), the request is minted
  // anyway and the guest keys a card in on the confirm page.
  allowNoCard?: boolean
  // 'kiosk' = the wall tablet. The DB column is free text (migration 091 only
  // COMMENTS the values; there is no CHECK constraint), so this needed no migration.
  createdBy?: 'june' | 'cron' | 'admin' | 'kiosk'
}

// Price a request and mint the pay-link token for it, without sending anything —
// the caller decides how the link reaches the guest. Reuses a live pending
// request of the same kind and duration so a guest can't end up with two live
// links (and two possible charges) for one session.
//
// (June's kiosk tool in lib/agent/june.ts still does this inline; it predates
// this helper and works, so it was left alone rather than refactored blind.)
export async function createExtensionRequest(
  bookingId: string,
  hours: number,
  opts: CreateExtensionOpts = {},
): Promise<{ token: string; priceCents: number; setName: string; hasCardOnFile: boolean } | { error: string }> {
  const { ttlMs = 30 * 60 * 1000, kind = 'extend', allowNoCard = false, createdBy } = opts

  const normalized = normalizeHours(hours)
  if (normalized == null) return { error: 'Pick between 30 minutes and 12 hours, in half-hour steps.' }

  const p = await planExtension(bookingId, normalized, kind)
  if ('error' in p) return { error: p.error }
  if (p.conflict) return { error: 'The set is booked right after this session.' }
  if (!p.hasCardOnFile && !allowNoCard) return { error: 'No card on file for this booking.' }

  const db = supabaseAdmin()
  const { data: existing } = await db
    .from('extension_requests')
    .select('id, confirm_token, hours, kind')
    .eq('booking_id', bookingId).eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (existing && Number(existing.hours) === normalized && (existing.kind ?? 'extend') === kind) {
    return { token: existing.confirm_token, priceCents: p.priceCents, setName: p.setName, hasCardOnFile: p.hasCardOnFile }
  }
  if (existing) await db.from('extension_requests').update({ status: 'cancelled' }).eq('id', existing.id)

  const token = randomUUID().replace(/-/g, '') + randomUUID().slice(0, 8)
  const { error } = await db.from('extension_requests').insert({
    booking_id: bookingId,
    hours: normalized,
    kind,
    amount_cents: p.priceCents,
    confirm_token: token,
    ...(createdBy ? { created_by: createdBy } : {}),
    expires_at: new Date(Date.now() + ttlMs).toISOString(),
  })
  if (error) return { error: error.message }
  return { token, priceCents: p.priceCents, setName: p.setName, hasCardOnFile: p.hasCardOnFile }
}

// Find the booking happening NOW (or starting within 30 min) for a phone number.
export async function findActiveBookingByPhone(phone: string): Promise<string | null> {
  const db = supabaseAdmin()
  const digits = (p: string | null | undefined) => (p ?? '').replace(/\D/g, '').slice(-10)
  const target = digits(phone)
  if (target.length < 10) return null

  const now = Date.now()
  const { data: rows } = await db
    .from('bookings')
    .select('id, start_time, end_time, set_id, customers!inner(phone)')
    .eq('status', 'confirmed')
    .lte('start_time', new Date(now + 30 * 60 * 1000).toISOString())
    .gte('end_time', new Date(now).toISOString())

  const match = (rows ?? [])
    .filter((b: any) => {
      const cust = Array.isArray(b.customers) ? b.customers[0] : b.customers
      return b.set_id !== null && cust && digits(cust.phone) === target
    })
    .sort((a: any, b: any) => Date.parse(a.start_time) - Date.parse(b.start_time))[0]

  return match?.id ?? null
}

// ── Who is on this set RIGHT NOW ─────────────────────────────────────────────
// The per-set kiosk primitive. The URL is the tablet's identity
// (/kiosk?set=set-a), and this answers "whose booking is that".
//
// ⭐ Why this is reliable: `bookings` carries a GIST exclusion constraint
// (`no_overlap`) on (set_id, tstzrange(start_time, end_time)) for non-cancelled
// rows. The database PHYSICALLY CANNOT hold two overlapping bookings on one set,
// so this returns exactly zero or one occupant. No login, no QR, no phone entry.
//
// ⚠️ BUYOUTS DO NOT PARTICIPATE in that constraint — a full-studio booking has
// `set_id = null`. Without the fallback below, every set tablet cheerfully
// reports "nobody's booked" while the entire building is rented. A tablet that
// states something false is worse than one that stays quiet, so the buyout case
// is handled here rather than deferred.
//
// ⚠️ Only `confirmed` counts. A `pending_payment` hold is not a person standing
// in the room, and showing their name would leak an unpaid booking.
export interface SetOccupancy {
  kind:       'booking' | 'buyout' | 'none'
  bookingId?: string
  firstName?: string
  startISO?:  string
  endISO?:    string
  checkedIn?: boolean
  /** true when the occupant is a full-studio buyout rather than this set's own booking */
  buyout?:    boolean
  /** Start of the next confirmed booking on this set, whenever it is. Null = clear. */
  nextStartISO?:  string | null
  /** Hours the occupant could actually BUY, floored to a half hour. 0 = none. */
  headroomHours?: number
  /** Which bound won. The tablet says something different for each. */
  headroomLimit?: HeadroomLimit
  /** False for buyouts and off-hours ends — those are a human conversation. */
  extendable?:    boolean
}

// The studio day ends at 22:00 Central. This is not a new decision — the admin
// calendar's inBusinessHours is `h >= 9 && h <= 22`, the booking picker stops
// offering starts at 21:30, and the jukebox sleeps outside 9-22. Self-serve
// extension was the ONE path that never checked it, so a guest could buy their
// way to 3 AM at the $40 set rate. The FAQ says time past closing is billed at
// the full warehouse rate — that is a conversation with a human, not a button.
export const STUDIO_CLOSE_HOUR = 22

export type HeadroomLimit = 'next-booking' | 'closing' | 'max'

export interface SetHeadroom {
  nextStartISO:  string | null
  headroomHours: number
  headroomLimit: HeadroomLimit
}

// How much time is actually buyable after this booking ends.
//
// ⚠️ This asks a DIFFERENT question from the wrap-up cron's nextOnSet(), and the
// difference is deliberate. That one looks exactly one hour ahead, because it is
// answering "is somebody about to need this room" — a warning. This one looks
// however far ahead the next booking is, because it is answering "how much can I
// sell you" — a price. They agree wherever they overlap: a booking 45 minutes
// out makes the cron warn AND caps this at 30 minutes.
export async function setHeadroom(
  setId: string,
  endISO: string,
  excludeBookingId: string,
): Promise<SetHeadroom> {
  const db = supabaseAdmin()
  const end = Date.parse(endISO)

  // A session that ends outside business hours cannot be self-extended at all:
  // the next half hour is warehouse-rate time and priced by a person.
  const endHour = centralHourDecimal(endISO)
  if (endHour < 9 || endHour >= STUDIO_CLOSE_HOUR) {
    return { nextStartISO: null, headroomHours: 0, headroomLimit: 'closing' }
  }

  const { data: nextRows, error } = await db
    .from('bookings')
    .select('start_time')
    .eq('set_id', setId)
    .neq('status', 'cancelled')
    .neq('id', excludeBookingId)
    .gte('start_time', new Date(end - 60_000).toISOString())
    .order('start_time', { ascending: true })
    .limit(1)
  // ⚠️ supabase-js does not throw. A FAILED query must never read as "wide
  // open" — that is how you put an ADD TIME button on a set booked solid.
  if (error) {
    console.error('[kiosk] headroom query failed:', error.message)
    return { nextStartISO: null, headroomHours: 0, headroomLimit: 'next-booking' }
  }

  const nextStartISO = (nextRows ?? [])[0]?.start_time ?? null

  const closeMs = Date.parse(bookingHourToISO(centralDateStr(endISO), STUDIO_CLOSE_HOUR))
  const bounds: { ms: number; limit: HeadroomLimit }[] = [
    { ms: closeMs - end,      limit: 'closing' },
    { ms: 12 * 3600_000,      limit: 'max' },
  ]
  if (nextStartISO) bounds.push({ ms: Date.parse(nextStartISO) - end, limit: 'next-booking' })
  bounds.sort((a, b) => a.ms - b.ms)

  // FLOOR to a half hour. Rounding up here would sell time that overruns the
  // very bound we just computed.
  const hours = Math.max(0, Math.floor((bounds[0].ms / 3600_000) * 2) / 2)
  return { nextStartISO, headroomHours: Math.min(hours, 12), headroomLimit: bounds[0].limit }
}

export async function findActiveBookingBySet(setSlug: string): Promise<SetOccupancy> {
  const db = supabaseAdmin()
  const now = Date.now()

  const { data: setRow, error: setErr } = await db
    .from('sets').select('id').eq('slug', setSlug).maybeSingle()
  // ⚠️ supabase-js does not throw. Reading `error` is the difference between
  // "no such set" and "the query failed" — both would otherwise read as empty.
  if (setErr) { console.error('[kiosk] set lookup failed:', setErr.message); return { kind: 'none' } }
  if (!setRow) return { kind: 'none' }

  // Live now, or starting within 30 minutes so the tablet greets people who
  // arrive early. Generous lower bound catches long sessions already running.
  const { data: rows, error } = await db
    .from('bookings')
    .select('id, start_time, end_time, set_id, checked_in_at, customers(name)')
    .eq('status', 'confirmed')
    .lte('start_time', new Date(now + 30 * 60 * 1000).toISOString())
    .gt('end_time', new Date(now).toISOString())
  if (error) { console.error('[kiosk] occupancy query failed:', error.message); return { kind: 'none' } }

  const live = (rows ?? []) as any[]
  const first = (r: any) => {
    const c = Array.isArray(r.customers) ? r.customers[0] : r.customers
    return String(c?.name ?? 'Guest').trim().split(/\s+/)[0]
  }
  const shape = (r: any, buyout: boolean): SetOccupancy => ({
    kind: buyout ? 'buyout' : 'booking',
    bookingId: r.id,
    firstName: first(r),
    startISO: r.start_time,
    endISO: r.end_time,
    checkedIn: !!r.checked_in_at,
    buyout,
  })

  // This set's own booking wins. Earliest start, so a session already running
  // beats one starting in twenty minutes.
  const mine = live
    .filter(r => r.set_id === setRow.id)
    .sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time))[0]
  if (mine) {
    const head = await setHeadroom(setRow.id, mine.end_time, mine.id)
    return { ...shape(mine, false), ...head, extendable: head.headroomHours >= 0.5 }
  }

  // Otherwise a buyout has the whole building, this set included.
  const buyout = live
    .filter(r => r.set_id === null)
    .sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time))[0]
  // ⚠️ planExtension REFUSES buyouts ("extended by the team"). The tablet must
  // never print a price it cannot honour, so a buyout gets no headroom at all.
  if (buyout) {
    return { ...shape(buyout, true), nextStartISO: null, headroomHours: 0, headroomLimit: 'max', extendable: false }
  }

  return { kind: 'none' }
}
