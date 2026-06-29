import { NextRequest, NextResponse } from 'next/server'
import { Client, Environment } from 'square'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { requireStaff } from '@/lib/staff-auth'
import { audit } from '@/lib/audit'
import { getReservedQuantities, checkCartAvailability } from '@/lib/equipment-availability'

export const dynamic = 'force-dynamic'

const square = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN!,
  environment: process.env.SQUARE_ENVIRONMENT === 'production' ? Environment.Production : Environment.Sandbox,
})

const BOOKING_SELECT = `
  id, start_time, end_time, status, square_card_on_file_id,
  sets ( name ),
  customers ( name, email, square_customer_id )
`

async function loadBooking(id: string) {
  const { data } = await supabaseAdmin().from('bookings').select(BOOKING_SELECT).eq('id', id).maybeSingle()
  return data
}

// GET /api/desk/bookings/[id]/add-gear
// Returns the gear catalog with units actually free for this booking's window,
// plus whether the booking has a card on file.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const g = requireStaff(req, 'addon.add')
  if (g instanceof NextResponse) return g

  const b = await loadBooking(params.id)
  if (!b) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
  const db = supabaseAdmin()

  const { data: rows } = await db
    .from('equipment')
    .select('id, name, rate, category, quantity, sort_order')
    .eq('is_available', true)
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  let reserved: Record<string, number> = {}
  try {
    reserved = await getReservedQuantities(db, b.start_time, b.end_time, { excludeBookingId: params.id })
  } catch { /* fall back to totals */ }

  const equipment = (rows ?? []).map(e => ({
    id: e.id, name: e.name, rate: Number(e.rate), category: e.category,
    available: Math.max(0, (e.quantity ?? 0) - (reserved[e.id] ?? 0)),
  }))

  const customer = b.customers as any
  return NextResponse.json({
    equipment,
    hasCardOnFile: !!(b.square_card_on_file_id && customer?.square_customer_id),
  })
}

// POST /api/desk/bookings/[id]/add-gear  { items: [{equipment_id, quantity}], charge }
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = requireStaff(req, 'addon.add')
  if (g instanceof NextResponse) return g

  let body: { items?: { equipment_id: string; quantity: number }[]; charge?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }) }

  const items = (body.items ?? []).filter(i => i.equipment_id && (i.quantity ?? 0) > 0)
  if (items.length === 0) return NextResponse.json({ error: 'Pick at least one item.' }, { status: 400 })

  const b = await loadBooking(params.id)
  if (!b) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
  if (b.status === 'cancelled') return NextResponse.json({ error: 'This booking was cancelled.' }, { status: 400 })
  const db = supabaseAdmin()
  const customer = b.customers as any

  // Aggregate + availability guard (excludes this booking's own reservations).
  const requested: Record<string, number> = {}
  for (const i of items) requested[i.equipment_id] = (requested[i.equipment_id] ?? 0) + Math.floor(i.quantity)

  const avail = await checkCartAvailability(db, b.start_time, b.end_time, requested, params.id)
  if (!avail.ok) {
    const names = avail.conflicts.map(c => `${c.name} (only ${c.available} free)`).join(', ')
    return NextResponse.json({ error: `Not enough available: ${names}` }, { status: 409 })
  }

  // Authoritative rates + total.
  const ids = Object.keys(requested)
  const { data: equipRows } = await db.from('equipment').select('id, name, rate').in('id', ids)
  const rateOf = new Map((equipRows ?? []).map(e => [e.id, Number(e.rate)]))
  const totalCents = Math.round(ids.reduce((s, id) => s + (rateOf.get(id) ?? 0) * requested[id], 0) * 100)
  if (totalCents <= 0) return NextResponse.json({ error: 'Could not price the gear.' }, { status: 400 })

  const hasCard = !!(b.square_card_on_file_id && customer?.square_customer_id)
  let squarePaymentId: string | null = null

  if (body.charge) {
    if (!hasCard) return NextResponse.json({ error: 'No card on file to charge.' }, { status: 400 })
    try {
      const { result } = await square.paymentsApi.createPayment({
        sourceId: b.square_card_on_file_id as string,
        idempotencyKey: randomUUID(),
        amountMoney: { amount: BigInt(totalCents), currency: 'USD' },
        customerId: customer.square_customer_id,
        locationId: process.env.SQUARE_LOCATION_ID!,
        note: `Made Kulture — gear add-on (${(b.sets as any)?.name ?? 'booking'})`,
        buyerEmailAddress: customer?.email || undefined,
      })
      squarePaymentId = result.payment?.id ?? null
    } catch (e: any) {
      console.error('[add-gear] charge failed', e)
      return NextResponse.json({ error: e?.errors?.[0]?.detail || 'Card charge failed.' }, { status: 402 })
    }
  }

  // Persist the add-ons (reserves inventory + shows in admin "gear to prep").
  const rows = ids.map(id => ({
    booking_id: params.id,
    equipment_id: id,
    quantity: requested[id],
    rate: rateOf.get(id) ?? 0,
    paid: !!squarePaymentId,
    square_order_id: squarePaymentId,
  }))
  const { error: insErr } = await db.from('booking_add_ons').insert(rows)
  if (insErr) {
    console.error('[add-gear] insert failed', insErr)
    return NextResponse.json({
      error: squarePaymentId ? 'Charged, but could not attach the gear — check the booking.' : 'Could not attach the gear.',
      charged: !!squarePaymentId,
    }, { status: 500 })
  }

  await audit(g, 'booking.add_gear', {
    entityType: 'booking', entityId: params.id, amountCents: body.charge ? totalCents : undefined,
    details: { items: requested, charged: !!squarePaymentId, squarePaymentId },
  })

  return NextResponse.json({ success: true, charged: !!squarePaymentId, totalCents })
}
