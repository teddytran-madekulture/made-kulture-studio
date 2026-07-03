// Session-extension planning — shared by June's kiosk tool and the customer
// confirm endpoint. Mirrors the pricing/conflict logic of the staff add-time
// route (per-customer overrides included) so every path prices identically.

import { supabaseAdmin } from '@/lib/supabase'

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
  id, start_time, end_time, status, set_id, total_amount, customer_id, gcal_event_id,
  square_card_on_file_id,
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
    hasCardOnFile: !!(b.square_card_on_file_id && customer?.square_customer_id),
  }
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
