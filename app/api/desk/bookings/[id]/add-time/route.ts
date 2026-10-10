import { addRewardForCharge } from '@/lib/rewards'
import { NextRequest, NextResponse } from 'next/server'
import { spaceMatesOf } from '@/lib/set-catalog'
import { Client, Environment } from 'square'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { requireStaff } from '@/lib/staff-auth'
import { audit } from '@/lib/audit'
import { notifyCoverageGap } from '@/lib/coverage'

export const dynamic = 'force-dynamic'

const square = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN!,
  environment: process.env.SQUARE_ENVIRONMENT === 'production' ? Environment.Production : Environment.Sandbox,
})

// ⚠️ The rate table and rateFor() that used to live here were a THIRD copy of
// lib/extensions.ts's, and when the guest surcharge was added to checkout none
// of the copies learned about it — so staff add-time charged a guest the member
// rate. Importing the shared helper is the point: the next pricing rule only has
// to be taught once. See migration 100.
import { effectiveHourlyRate } from '@/lib/extensions'
import { guestAmountsForWindow } from '@/lib/guest-rate'

const SELECT = `
  id, start_time, end_time, status, set_id, total_amount, guest_surcharge_amount, guest_fee_amount, hourly_rate,
  customer_id, square_card_on_file_id,
  sets ( name, rate_per_hour ),
  customers ( name, email, phone, square_customer_id, pricing_overrides )
`

// Compute the extension: rate, price, new end time, card-on-file, and whether the
// set is free for the added window. Returns an error reason if it can't be priced.
async function plan(id: string, hours: number) {
  const db = supabaseAdmin()
  const { data: b } = await db.from('bookings').select(SELECT).eq('id', id).maybeSingle()
  if (!b) return { error: 'Booking not found.' as string }
  if (b.status === 'cancelled') return { error: 'This booking was cancelled.' }

  const setName = (b.sets as any)?.name as string | undefined
  const customer = b.customers as any
  if (!b.set_id || !setName) return { error: 'Can’t auto-price a full-buyout extension — charge and extend manually.' }

  // ⚠️ Includes the guest surcharge this booking was sold at — see the note on
  // effectiveHourlyRate. Pricing this at the bare set rate undercharged every
  // non-member who added time at the desk.
  const rate = effectiveHourlyRate(setName, customer?.pricing_overrides, b as any)
  if (!rate) return { error: `No hourly rate found for ${setName}.` }

  const priceCents = Math.round(rate * hours * 100)
  const curEnd = new Date(b.end_time)
  const newEnd = new Date(curEnd.getTime() + hours * 3600_000)

  // Conflict: any other live booking overlapping [curEnd, newEnd) on this set,
  // a set sharing its room (migration 163), or a full buyout (set_id NULL —
  // `.eq` never matched it, the same blind spot lib/extensions fixed 2026-09-27).
  // A failed lookup reads as a conflict, never "free".
  let mates: string[] | null = null
  try { mates = await spaceMatesOf(db, b.set_id) } catch (e: any) { console.error('[desk add-time] space-mate lookup failed:', e?.message) }
  const { data: clash, error: clashErr } = await db
    .from('bookings')
    .select('id')
    .or(`set_id.in.(${(mates ?? [b.set_id]).join(',')}),set_id.is.null`)
    .neq('status', 'cancelled')
    .neq('id', id)
    .lt('start_time', newEnd.toISOString())
    .gt('end_time', curEnd.toISOString())
    .limit(1)

  return {
    booking: b, setName, rate, priceCents,
    newEndISO: newEnd.toISOString(),
    conflict: !!(clash && clash.length) || !!clashErr || !mates,
    hasCardOnFile: !!(b.square_card_on_file_id && customer?.square_customer_id),
  }
}

// GET preview: ?hours=N → price, card status, conflict (no charge, no change).
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const g = requireStaff(req, 'addon.add')
  if (g instanceof NextResponse) return g
  const hours = Number(new URL(req.url).searchParams.get('hours') || 0)
  if (!(hours > 0 && hours <= 12)) return NextResponse.json({ error: 'Enter 1–12 hours.' }, { status: 400 })

  const p = await plan(params.id, hours)
  if ('error' in p) return NextResponse.json({ error: p.error }, { status: 400 })
  return NextResponse.json({
    priceCents: p.priceCents, rate: p.rate, setName: p.setName,
    conflict: p.conflict, hasCardOnFile: p.hasCardOnFile, newEnd: p.newEndISO,
  })
}

// POST execute: { hours, charge } → optionally charge card on file, then extend end_time.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = requireStaff(req, 'addon.add')
  if (g instanceof NextResponse) return g

  let body: { hours?: number; charge?: boolean }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }) }
  const hours = Number(body.hours || 0)
  if (!(hours > 0 && hours <= 12)) return NextResponse.json({ error: 'Enter 1–12 hours.' }, { status: 400 })

  const p = await plan(params.id, hours)
  if ('error' in p) return NextResponse.json({ error: p.error }, { status: 400 })
  if (p.conflict) return NextResponse.json({ error: 'The set is booked right after — can’t extend into another booking.' }, { status: 409 })

  const db = supabaseAdmin()
  const b = p.booking as any
  const customer = b.customers as any
  let squarePaymentId: string | null = null

  // Charge the card on file if requested and available.
  if (body.charge) {
    if (!p.hasCardOnFile) return NextResponse.json({ error: 'No card on file to charge.' }, { status: 400 })
    try {
      const { result } = await square.paymentsApi.createPayment({
        sourceId: b.square_card_on_file_id,
        idempotencyKey: randomUUID(),
        amountMoney: { amount: BigInt(p.priceCents), currency: 'USD' },
        customerId: customer.square_customer_id,
        locationId: process.env.SQUARE_LOCATION_ID!,
        note: `Made Kulture — +${hours}hr ${p.setName}`,
        buyerEmailAddress: customer?.email || undefined,
      })
      squarePaymentId = result.payment?.id ?? null
    } catch (e: any) {
      console.error('[add-time] charge failed', e)
      return NextResponse.json({ error: e?.errors?.[0]?.detail || 'Card charge failed.' }, { status: 402 })
    }
  }

  // Extend the booking end time (+ bump stored total for the space charge).
  const newTotal = b.total_amount != null ? Number(b.total_amount) + p.rate * hours : null
  const { error: upErr } = await db.from('bookings')
    // Keep the guest surcharge / extra-person fee at the same per-hour rate.
    .update({ end_time: p.newEndISO, ...guestAmountsForWindow(b as any, b.start_time, p.newEndISO), ...(newTotal != null ? { total_amount: newTotal } : {}) })
    .eq('id', params.id)
  if (upErr) {
    const conflict = upErr.code === '23P01' || /overlap|conflict/i.test(upErr.message || '')
    // If the charge succeeded but extend failed, surface it clearly (rare).
    return NextResponse.json({
      error: conflict ? 'The set is booked right after — can’t extend.' : 'Charged, but could not extend the booking — check the schedule.',
      charged: !!squarePaymentId,
    }, { status: conflict ? 409 : 500 })
  }

  // Card-paid extra time earns rewards like the original booking.
  if (squarePaymentId) await addRewardForCharge(db, params.id, p.priceCents, `extra time ${p.setName}`)

  await audit(g, 'booking.add_time', {
    entityType: 'booking', entityId: params.id, amountCents: body.charge ? p.priceCents : undefined,
    details: { hours, setName: p.setName, charged: !!squarePaymentId, squarePaymentId, newEnd: p.newEndISO },
  })

  // Added time can run past the shift covering this session — warn on a gap.
  await notifyCoverageGap(params.id).catch(() => {})

  return NextResponse.json({ success: true, charged: !!squarePaymentId, priceCents: p.priceCents, newEnd: p.newEndISO })
}
