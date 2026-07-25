// Session-extension planning — shared by June's kiosk tool and the customer
// confirm endpoint. Mirrors the pricing/conflict logic of the staff add-time
// route (per-customer overrides included) so every path prices identically.

import { supabaseAdmin } from '@/lib/supabase'
import { randomUUID } from 'crypto'

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

const SELECT = `
  id, start_time, end_time, status, set_id, total_amount, customer_id, auth_user_id, gcal_event_id,
  square_card_on_file_id, door_code, door_code_back,
  sets ( name ),
  customers ( name, email, phone, square_customer_id, pricing_overrides )
`

export interface ExtensionPlan {
  booking: any
  setName: string
  customerName: string
  customerPhone: string | null
  rate: number
  priceCents: number
  newEndISO: string
  conflict: boolean
  hasCardOnFile: boolean
}

export async function planExtension(bookingId: string, hours: number): Promise<ExtensionPlan | { error: string }> {
  const db = supabaseAdmin()
  const { data: b } = await db.from('bookings').select(SELECT).eq('id', bookingId).maybeSingle()
  if (!b) return { error: 'Booking not found.' }
  if (b.status !== 'confirmed') return { error: 'This booking is not active.' }

  const setName = (b.sets as any)?.name as string | undefined
  const customer = b.customers as any
  if (!b.set_id || !setName) return { error: 'Full-studio buyouts are extended by the team — tap GET THE TEAM or text (832) 408-1631.' }

  const rate = rateFor(setName, customer?.pricing_overrides)
  if (!rate) return { error: `No hourly rate found for ${setName}.` }

  const priceCents = Math.round(rate * hours * 100)
  const curEnd = new Date(b.end_time)
  const newEnd = new Date(curEnd.getTime() + hours * 3600_000)

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
    setName,
    customerName: customer?.name ?? 'Guest',
    customerPhone: customer?.phone ?? null,
    rate,
    priceCents,
    newEndISO: newEnd.toISOString(),
    conflict: !!(clash && clash.length),
    // Optimistic: a Square customer profile can hold saved cards even when this
    // particular booking wasn't paid with one. The confirm endpoint resolves the
    // actual card (booking's card → else customer's saved cards) before charging.
    hasCardOnFile: !!customer?.square_customer_id,
  }
}

// Price an extension and mint the pay-link token for it, without sending
// anything — the caller decides how the link reaches the guest. Reuses a live
// pending request for the same hours so a guest can't end up with two live
// links (and two possible charges) for one session.
//
// ttlMs is the link's lifetime: June's kiosk flow uses a tight 15 min because
// the guest is standing right there, but the wrap-up text needs longer — it
// arrives 15 min before the session ends and the guest is mid-pack-up.
//
// (June's kiosk tool in lib/agent/june.ts still does this inline; it predates
// this helper and works, so it was left alone rather than refactored blind.)
export async function createExtensionRequest(
  bookingId: string,
  hours: number,
  ttlMs = 30 * 60 * 1000,
): Promise<{ token: string; priceCents: number; setName: string } | { error: string }> {
  const p = await planExtension(bookingId, hours)
  if ('error' in p) return { error: p.error }
  if (p.conflict) return { error: 'The set is booked right after this session.' }
  if (!p.hasCardOnFile) return { error: 'No card on file for this booking.' }

  const db = supabaseAdmin()
  const { data: existing } = await db
    .from('extension_requests')
    .select('id, confirm_token, hours')
    .eq('booking_id', bookingId).eq('status', 'pending')
    .gt('expires_at', new Date().toISOString())
    .maybeSingle()

  if (existing && existing.hours === hours) {
    return { token: existing.confirm_token, priceCents: p.priceCents, setName: p.setName }
  }
  if (existing) await db.from('extension_requests').update({ status: 'cancelled' }).eq('id', existing.id)

  const token = randomUUID().replace(/-/g, '') + randomUUID().slice(0, 8)
  const { error } = await db.from('extension_requests').insert({
    booking_id: bookingId,
    hours,
    amount_cents: p.priceCents,
    confirm_token: token,
    expires_at: new Date(Date.now() + ttlMs).toISOString(),
  })
  if (error) return { error: error.message }
  return { token, priceCents: p.priceCents, setName: p.setName }
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
