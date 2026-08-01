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
  createdBy?: 'june' | 'cron' | 'admin'
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
