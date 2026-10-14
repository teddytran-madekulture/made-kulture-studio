import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { Client, Environment } from 'square'
import { randomUUID } from 'crypto'
import { getPlusPricing, plusIntroEligible, plusCardUsedBefore } from '@/lib/plus-pricing'
import { plusActive } from '@/lib/short-notice'
import { refundPayment } from '@/lib/square-refund'
import { sendPlusReceiptEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function isoPlusMonths(months: number): string {
  const d = new Date(); d.setMonth(d.getMonth() + months); return d.toISOString()
}

// POST /api/admin/customers/[id]/plus — manage a customer's Plus membership.
// Body: { action: 'grant' | 'revoke' | 'autorenew', months?, autoRenew? }
// 'grant' here is a COMP/manual grant (no charge); the self-serve checkout is
// what charges. Membership state lives on customers.pricing_overrides.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({} as any))
  const action = String(body.action || '')

  const { data: cust } = await supabase
    .from('customers').select('id, email, name, phone, pricing_overrides, square_customer_id').eq('id', params.id).maybeSingle()
  if (!cust) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  // 2026-10-14: SELL Plus from the admin side by charging a card on file — for
  // a customer standing in the studio. 'quote' prices it exactly like the
  // self-serve checkout (intro only for someone who has never had Plus);
  // 'sell' re-prices on the server, charges, then activates. Auto-renew is OFF
  // unless the admin ticks that the customer agreed to it.
  if (action === 'quote' || action === 'sell') return sellPlus(action, cust, body)

  const po: any = { ...(cust.pricing_overrides || {}) }

  if (action === 'grant') {
    const months = Number(body.months) > 0 ? Number(body.months) : 12
    po.plus = true
    po.plus_started_at = new Date().toISOString()
    po.plus_expires_at = isoPlusMonths(months)
    po.plus_auto_renew = body.autoRenew === true   // comp grants default to NO auto-charge
    po.plus_comp = true
  } else if (action === 'revoke') {
    po.plus = false
    delete po.plus_started_at; delete po.plus_expires_at; delete po.plus_auto_renew; delete po.plus_comp
  } else if (action === 'autorenew') {
    if (!po.plus) return NextResponse.json({ error: 'Not a Plus member' }, { status: 400 })
    po.plus_auto_renew = body.autoRenew === true
  } else if (action === 'suspend') {
    // Abuse lever: block auto-renewal until an admin overrides. The renewal cron
    // skips members with plus_renewal_suspended set.
    if (!po.plus) return NextResponse.json({ error: 'Not a Plus member' }, { status: 400 })
    po.plus_renewal_suspended = body.suspended === true
  } else {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const { error } = await supabase.from('customers').update({ pricing_overrides: po }).eq('id', cust.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (action === 'grant') {
    await supabase.from('plus_payments').insert({
      customer_id: cust.id, customer_email: cust.email, amount_cents: 0, kind: 'comp',
      period_start: po.plus_started_at, period_end: po.plus_expires_at,
    })
  }

  return NextResponse.json({ ok: true, pricingOverrides: po })
}

async function sellPlus(action: 'quote' | 'sell', cust: any, body: any) {
  const email = String(cust.email || '').toLowerCase()
  if (!email) return NextResponse.json({ error: 'This customer has no email on file.' }, { status: 400 })
  if (plusActive(cust.pricing_overrides ?? null)) return NextResponse.json({ error: 'Already an active Plus member.' }, { status: 400 })

  const pricing = await getPlusPricing(supabase)
  const introOk = pricing.isIntro && await plusIntroEligible(supabase, { email, phones: [cust.phone] })
  let cents = introOk ? pricing.introCents : pricing.standardCents
  if (action === 'quote') return NextResponse.json({ cents, isIntro: introOk, standardCents: pricing.standardCents })

  const cardId = String(body.squareCardId || '')
  const sqCustId = String(body.squareCustomerId || '')
  if (!cardId || !sqCustId) return NextResponse.json({ error: 'Pick a card on file.' }, { status: 400 })

  const square = new Client({
    accessToken: process.env.SQUARE_ACCESS_TOKEN!,
    environment: process.env.SQUARE_ENVIRONMENT === 'production' ? Environment.Production : Environment.Sandbox,
  })
  // The card must exist, be enabled and belong to the Square customer we were handed.
  const got = await square.cardsApi.retrieveCard(cardId).catch(() => null)
  const card = got?.result.card
  if (!card || card.enabled === false || card.customerId !== sqCustId) {
    return NextResponse.json({ error: 'That card is no longer usable. Pick another or have them pay on the website.' }, { status: 400 })
  }
  // Same rule as checkout: a card that already had Plus on another account pays standard.
  if (cents === pricing.introCents && cents !== pricing.standardCents && await plusCardUsedBefore(supabase, card.fingerprint)) {
    cents = pricing.standardCents
  }
  // Never charge more than the screen showed without a fresh confirm.
  const expected = Number(body.expectedCents)
  if (!Number.isFinite(expected) || expected !== cents) {
    return NextResponse.json({ code: 'price_changed', cents, error: `The price for this customer is $${(cents / 100).toFixed(0)} (this card has had Plus before). Confirm to charge that.` }, { status: 409 })
  }

  let paymentId: string | null = null
  try {
    const pay = await square.paymentsApi.createPayment({
      sourceId: cardId, customerId: sqCustId, idempotencyKey: randomUUID(),
      amountMoney: { amount: BigInt(cents), currency: 'USD' },
      locationId: process.env.SQUARE_LOCATION_ID!,
      note: 'Made Kulture — Plus membership (1 year) [admin]',
      buyerEmailAddress: email,
    })
    paymentId = pay.result.payment?.id ?? null
  } catch (err: any) {
    const detail = err?.errors?.[0]?.detail || err?.message || 'Card declined.'
    return NextResponse.json({ error: `Charge failed: ${detail}. Plus was not activated.` }, { status: 402 })
  }

  const now = new Date()
  const po: any = { ...(cust.pricing_overrides || {}) }
  po.plus = true
  po.plus_started_at = now.toISOString()
  po.plus_expires_at = isoPlusMonths(12)
  po.plus_auto_renew = body.autoRenew === true
  po.plus_comp = false
  const upd: any = { pricing_overrides: po }
  // Renewals charge a card on customers.square_customer_id — point it at the
  // profile that owns this card if the row has none.
  if (!cust.square_customer_id) upd.square_customer_id = sqCustId
  const { data: done, error } = await supabase.from('customers').update(upd).eq('id', cust.id).select('id')
  if (error || !done?.length) {
    console.error('[admin plus sell] charged but activation failed — refunding', paymentId, error)
    let refunded = false
    if (paymentId) { try { await refundPayment({ paymentId, amountCents: cents, reason: 'Plus could not be activated' }); refunded = true } catch (e) { console.error(e) } }
    return NextResponse.json({ error: refunded ? 'Plus could not be activated, so the charge was refunded.' : `Charged but Plus did NOT activate and the refund failed. Refund payment ${paymentId} in Square.` }, { status: 500 })
  }
  await supabase.from('plus_payments').insert({
    customer_id: cust.id, customer_email: email, amount_cents: cents, square_payment_id: paymentId,
    kind: 'manual', period_start: po.plus_started_at, period_end: po.plus_expires_at, card_fingerprint: card.fingerprint ?? null,
  })
  try { await sendPlusReceiptEmail({ customerName: cust.name || email, customerEmail: email, amountCents: cents, expiresAt: po.plus_expires_at }) } catch {}
  return NextResponse.json({ ok: true, cents, pricingOverrides: po })
}
