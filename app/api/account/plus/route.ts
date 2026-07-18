import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { Client, Environment } from 'square'
import { randomUUID } from 'crypto'
import { findOrCreateSquareCustomer } from '@/lib/square-customer'
import { plusActive, plusExpiresAtMs } from '@/lib/short-notice'
import { getPlusPricing } from '@/lib/plus-pricing'
import { sendPlusReceiptEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

function getSquare() {
  return new Client({
    accessToken: process.env.SQUARE_ACCESS_TOKEN!,
    environment: process.env.SQUARE_ENVIRONMENT === 'production' ? Environment.Production : Environment.Sandbox,
  })
}

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function isoPlusMonths(from: Date, months: number): string {
  const d = new Date(from); d.setMonth(d.getMonth() + months); return d.toISOString()
}

// The customers row (by email) holds pricing_overrides where Plus state lives.
async function ensureCustomerRow(email: string, name: string | null, phone: string | null) {
  const { data: rows } = await service
    .from('customers').select('id, pricing_overrides, square_customer_id').eq('email', email).order('created_at', { ascending: true }).limit(1)
  const existing = (rows ?? [])[0]
  if (existing) return existing
  const { data: created } = await service
    .from('customers').insert({ email, name, phone }).select('id, pricing_overrides, square_customer_id').maybeSingle()
  return created
}

// GET — membership status for the logged-in customer (drives the account card).
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const email = user.email.toLowerCase()
  const { data: grows } = await service.from('customers').select('pricing_overrides').eq('email', email).limit(1)
  const po: any = (grows ?? [])[0]?.pricing_overrides ?? null
  const pricing = await getPlusPricing(service)
  return NextResponse.json({
    active:    plusActive(po),
    expiresAt: plusExpiresAtMs(po),
    autoRenew: !!po?.plus_auto_renew,
    comp:      !!po?.plus_comp,
    priceCents:    pricing.currentCents,
    standardCents: pricing.standardCents,
    introCents:    pricing.introCents,
    introUntil:    pricing.introUntil,
    isIntro:       pricing.isIntro,
  })
}

// POST — { action: 'checkout', sourceId } charges + activates; { action: 'autorenew', autoRenew } toggles.
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const email = user.email.toLowerCase()
  const body = await req.json().catch(() => ({} as any))
  const action = String(body.action || 'checkout')

  const { data: profile } = await supabase
    .from('customer_profiles').select('full_name, phone, square_customer_id').eq('id', user.id).maybeSingle()
  const name = profile?.full_name ?? email.split('@')[0]

  // Toggle auto-renew (opt out / back in).
  if (action === 'autorenew') {
    const cust = await ensureCustomerRow(email, name, profile?.phone ?? null)
    if (!cust) return NextResponse.json({ error: 'No membership found' }, { status: 400 })
    const po: any = { ...(cust.pricing_overrides || {}) }
    if (!po.plus) return NextResponse.json({ error: 'Not a Plus member' }, { status: 400 })
    po.plus_auto_renew = body.autoRenew === true
    await service.from('customers').update({ pricing_overrides: po }).eq('id', cust.id)
    return NextResponse.json({ ok: true, autoRenew: po.plus_auto_renew })
  }

  // Checkout: charge the annual fee, save the card on file, activate 1 year.
  const sourceId = String(body.sourceId || '')
  if (!sourceId) return NextResponse.json({ error: 'Card details are required.' }, { status: 400 })

  // Already active? Don't double-charge.
  {
    const { data: curRows } = await service.from('customers').select('pricing_overrides').eq('email', email).limit(1)
    if (plusActive((curRows ?? [])[0]?.pricing_overrides ?? null)) {
      return NextResponse.json({ error: 'You already have an active Plus membership.' }, { status: 400 })
    }
  }

  const cents = (await getPlusPricing(service)).currentCents

  try {
    const square = getSquare()

    // Square customer for card-on-file (reuse the profile's, else find/create + save).
    let sqCustId = profile?.square_customer_id ?? null
    if (!sqCustId) {
      sqCustId = await findOrCreateSquareCustomer(square, { email, name, phone: profile?.phone ?? null })
      if (sqCustId) await supabase.from('customer_profiles').update({ square_customer_id: sqCustId }).eq('id', user.id)
    }
    if (!sqCustId) return NextResponse.json({ error: 'Could not set up your payment profile.' }, { status: 500 })

    // Save the card (consumes the single-use nonce) so renewals can charge it,
    // then charge the stored card.
    const cardRes = await square.cardsApi.createCard({ idempotencyKey: randomUUID(), sourceId, card: { customerId: sqCustId } })
    const savedCardId = cardRes.result.card?.id
    if (!savedCardId) return NextResponse.json({ error: 'Could not save your card.' }, { status: 400 })

    const pay = await square.paymentsApi.createPayment({
      sourceId:       savedCardId,
      customerId:     sqCustId,
      idempotencyKey: randomUUID(),
      amountMoney:    { amount: BigInt(cents), currency: 'USD' },
      locationId:     process.env.SQUARE_LOCATION_ID!,
      note:           'Made Kulture — Plus membership (1 year)',
      buyerEmailAddress: email,
    })
    const squarePaymentId = pay.result.payment?.id ?? null

    // Activate membership on the customers row.
    const cust = await ensureCustomerRow(email, name, profile?.phone ?? null)
    const now = new Date()
    const startIso = now.toISOString()
    const expiresIso = isoPlusMonths(now, 12)
    const po: any = { ...((cust?.pricing_overrides) || {}) }
    po.plus = true
    po.plus_started_at = startIso
    po.plus_expires_at = expiresIso
    po.plus_auto_renew = true
    po.plus_comp = false
    if (cust) {
      const upd: any = { pricing_overrides: po }
      if (!cust.square_customer_id) upd.square_customer_id = sqCustId
      await service.from('customers').update(upd).eq('id', cust.id)
      await service.from('plus_payments').insert({
        customer_id: cust.id, customer_email: email, amount_cents: cents,
        square_payment_id: squarePaymentId, kind: 'signup', period_start: startIso, period_end: expiresIso,
      })
    }

    try { await sendPlusReceiptEmail({ customerName: name, customerEmail: email, amountCents: cents, expiresAt: expiresIso }) } catch {}

    return NextResponse.json({ ok: true, expiresAt: new Date(expiresIso).getTime() })
  } catch (err: any) {
    const detail = err?.errors?.[0]?.detail || err?.message || 'Payment failed.'
    console.error('[account/plus] checkout error:', err)
    return NextResponse.json({ error: detail }, { status: 400 })
  }
}
