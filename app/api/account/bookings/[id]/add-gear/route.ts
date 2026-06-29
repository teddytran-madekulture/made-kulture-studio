import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { createClient } from '@supabase/supabase-js'
import { Client, Environment } from 'square'
import { randomUUID } from 'crypto'
import { checkCartAvailability } from '@/lib/equipment-availability'

// Service-role client for DB writes (bypasses RLS); auth is verified separately.
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const square = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN!,
  environment: process.env.SQUARE_ENVIRONMENT === 'production' ? Environment.Production : Environment.Sandbox,
})

// POST /api/account/bookings/[id]/add-gear
// Body: { equipment: [{ equipment_id, quantity }] }
// Reserves the gear on the booking and returns a Square payment link for it.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  // 1. Authenticate the customer
  const supabase = createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please sign in.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const lines: { equipment_id: string; quantity: number }[] = Array.isArray(body.equipment) ? body.equipment : []
  if (!lines.length) return NextResponse.json({ error: 'No gear provided' }, { status: 400 })

  // 2. Load the booking and confirm it belongs to this user
  const { data: booking } = await admin
    .from('bookings')
    .select('id, start_time, end_time, status, auth_user_id, customer_id, customers ( email ), sets ( name )')
    .eq('id', params.id)
    .single()

  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  const bookingEmail = (booking as any).customers?.email?.toLowerCase() ?? null
  const owns = booking.auth_user_id === user.id || bookingEmail === (user.email ?? '').toLowerCase()
  if (!owns) return NextResponse.json({ error: 'This booking is not on your account.' }, { status: 403 })
  if (booking.status === 'cancelled') return NextResponse.json({ error: 'This booking was cancelled.' }, { status: 400 })
  if (new Date(booking.start_time) <= new Date()) return NextResponse.json({ error: 'This booking has already started.' }, { status: 400 })

  // 3. Aggregate requested quantities + fetch authoritative rates
  const requested: Record<string, number> = {}
  for (const l of lines) requested[l.equipment_id] = (requested[l.equipment_id] ?? 0) + (l.quantity ?? 1)

  const ids = Object.keys(requested)
  const { data: equipRows } = await admin.from('equipment').select('id, name, rate').in('id', ids)
  const rateOf = new Map((equipRows ?? []).map(e => [e.id, Number(e.rate)]))

  // 4. Availability for this booking's window (excluding gear already on it)
  const avail = await checkCartAvailability(admin, booking.start_time, booking.end_time, requested, booking.id)
  if (!avail.ok) {
    const msg = avail.conflicts.map(c => `${c.name} (requested ${c.requested}, ${c.available} free)`).join('; ')
    return NextResponse.json({ error: `Some gear isn't available for your booking time: ${msg}.` }, { status: 409 })
  }

  // 5. Total + Square payment link (create first so we can store its order id)
  const total = ids.reduce((s, id) => s + (rateOf.get(id) ?? 0) * requested[id], 0)
  let url: string | undefined
  let orderId: string | undefined
  try {
    const { result } = await square.checkoutApi.createPaymentLink({
      idempotencyKey: randomUUID(),
      quickPay: {
        name:       `Made Kulture — Gear for ${(booking as any).sets?.name ?? 'your booking'}`,
        priceMoney: { amount: BigInt(Math.round(total * 100)), currency: 'USD' },
        locationId: process.env.SQUARE_LOCATION_ID!,
      },
    })
    url     = result.paymentLink?.url
    orderId = result.paymentLink?.orderId
    if (!url) throw new Error('No payment link returned')
  } catch (err: any) {
    console.error('[add-gear] payment link error:', err)
    return NextResponse.json({ error: 'Could not create payment link. Please try again.' }, { status: 500 })
  }

  // 6. Persist the add-ons (reserves inventory + shows on the booking for prep).
  //    paid = false until the Square webhook confirms payment for this order id.
  const addons = ids.map(id => ({
    booking_id:      booking.id,
    equipment_id:    id,
    quantity:        requested[id],
    rate:            rateOf.get(id) ?? 0,
    paid:            false,
    square_order_id: orderId ?? null,
  }))
  const { error: insErr } = await admin.from('booking_add_ons').insert(addons)
  if (insErr) {
    console.error('[add-gear] insert error:', insErr)
    return NextResponse.json({ error: 'Could not add gear. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ success: true, url, total })
}
