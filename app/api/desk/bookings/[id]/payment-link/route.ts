import { NextRequest, NextResponse } from 'next/server'
import { Client, Environment } from 'square'
import { sendSMSResult } from '@/lib/sms'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { requireStaff } from '@/lib/staff-auth'
import { audit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const square = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN!,
  environment: process.env.SQUARE_ENVIRONMENT === 'production' ? Environment.Production : Environment.Sandbox,
})

// POST /api/desk/bookings/[id]/payment-link  { amountCents, description? }
// Creates a Square checkout link for the amount and texts it to the booking's
// customer — for in-person guests with no card on file. They pay on their phone.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = requireStaff(req, 'payment.terminal')
  if (g instanceof NextResponse) return g

  let body: { amountCents?: number; description?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }) }

  const amountCents = Math.round(Number(body.amountCents) || 0)
  if (amountCents < 100) return NextResponse.json({ error: 'Enter an amount of at least $1.00.' }, { status: 400 })
  if (amountCents > 5_000_00) return NextResponse.json({ error: 'Amount looks too large — double-check it.' }, { status: 400 })

  const { data: b } = await supabaseAdmin()
    .from('bookings').select('id, customers ( name, phone )').eq('id', params.id).maybeSingle()
  if (!b) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
  const customer = b.customers as any

  let url: string | undefined
  try {
    const { result } = await square.checkoutApi.createPaymentLink({
      idempotencyKey: randomUUID(),
      quickPay: {
        name: (body.description || 'Made Kulture — balance').slice(0, 80),
        priceMoney: { amount: BigInt(amountCents), currency: 'USD' },
        locationId: process.env.SQUARE_LOCATION_ID!,
      },
    })
    url = result.paymentLink?.url
    if (!url) throw new Error('No URL returned')
  } catch (e: any) {
    console.error('[desk payment-link] create failed', e)
    return NextResponse.json({ error: e?.errors?.[0]?.detail || 'Could not create the payment link.' }, { status: 502 })
  }

  let smsSent = false, smsError: string | null = null
  if (customer?.phone) {
    const r = await sendSMSResult(customer.phone, [
      `Hi ${customer?.name ?? 'there'}! Please pay $${(amountCents / 100).toFixed(2)} for your Made Kulture booking:`,
      url, ``, `Questions? Text (832) 408-1631`,
    ].join('\n'))
    smsSent = r.ok
    if (!r.ok) smsError = r.error ?? 'SMS failed to send'
  }

  await audit(g, 'booking.payment_link', { entityType: 'booking', entityId: params.id, amountCents, details: { description: body.description ?? null, smsSent } })
  return NextResponse.json({ url, smsSent, smsError })
}
