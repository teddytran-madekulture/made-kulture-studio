import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { Client, Environment } from 'square'
import { randomUUID } from 'crypto'
import { findOrCreateSquareCustomer } from '@/lib/square-customer'
import { plusActive, plusExpiresAtMs } from '@/lib/short-notice'
import { getPlusPricing, plusIntroEligible, plusCardUsedBefore } from '@/lib/plus-pricing'
import { sendPlusReceiptEmail } from '@/lib/email'
import { sendOwnerPush } from '@/lib/push'

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
// ⚠️ customers.name and customers.phone are NOT NULL. A Google sign-up has no
// phone on its profile, so inserting `phone: null` failed SILENTLY and returned
// null — and checkout used to run this AFTER charging the card. Result
// (2026-10-01, Sandra Mobee): $99 taken, Plus never switched on. Phone now falls
// back to '' and the insert error is surfaced, and checkout calls this BEFORE
// any money moves.
async function ensureCustomerRow(email: string, name: string | null, phone: string | null) {
  const { data: rows } = await service
    .from('customers').select('id, pricing_overrides, square_customer_id').eq('email', email).order('created_at', { ascending: true }).limit(1)
  const existing = (rows ?? [])[0]
  if (existing) return existing
  const { data: created, error } = await service
    .from('customers')
    .insert({ email, name: (name || email.split('@')[0]), phone: (phone || '').trim() })
    .select('id, pricing_overrides, square_customer_id').maybeSingle()
  if (error) console.error('[account/plus] could not create customers row:', error)
  return created
}

// GET — membership status for the logged-in customer (drives the account card).
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) {
    // ?public=1 (the /plus page): a signed-out visitor still needs the price
    // and the promo. Everything else keeps the 401 — several callers read
    // r.ok as "signed in".
    if (req.nextUrl.searchParams.get('public') === '1') {
      const pricing = await getPlusPricing(service)
      return NextResponse.json({
        signedOut: true, active: false,
        priceCents:    pricing.isIntro ? pricing.introCents : pricing.standardCents,
        standardCents: pricing.standardCents,
        introCents:    pricing.introCents,
        introUntil:    pricing.introUntil,
        isIntro:       pricing.isIntro,
        returning:     false,
      })
    }
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const email = user.email.toLowerCase()
  const { data: grows } = await service.from('customers').select('pricing_overrides').eq('email', email).limit(1)
  const po: any = (grows ?? [])[0]?.pricing_overrides ?? null
  const pricing = await getPlusPricing(service)
  // The intro price is for people who have never had Plus. A returning member
  // sees the standard price and no "intro" banner (isIntro is reported false
  // for them so every page that shows the banner hides it).
  let eligible = true
  if (pricing.isIntro) {
    const { data: prof } = await service.from('customer_profiles').select('phone').eq('id', user.id).maybeSingle()
    eligible = await plusIntroEligible(service, { email, phones: [prof?.phone] })
  }
  const introNow = pricing.isIntro && eligible
  return NextResponse.json({
    active:    plusActive(po),
    expiresAt: plusExpiresAtMs(po),
    autoRenew: !!po?.plus_auto_renew,
    comp:      !!po?.plus_comp,
    priceCents:    introNow ? pricing.introCents : pricing.standardCents,
    standardCents: pricing.standardCents,
    introCents:    pricing.introCents,
    introUntil:    pricing.introUntil,
    isIntro:       introNow,
    returning:     pricing.isIntro && !eligible,
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
  // Either a fresh card nonce (sourceId) or — after a "this card has had Plus
  // before" answer — the card we already saved for them plus acceptStandard.
  const sourceId = String(body.sourceId || '')
  const retryCardId = String(body.savedCardId || '')
  const acceptStandard = body.acceptStandard === true
  if (!sourceId && !(retryCardId && acceptStandard)) {
    return NextResponse.json({ error: 'Card details are required.' }, { status: 400 })
  }

  // Already active? Don't double-charge.
  {
    const { data: curRows } = await service.from('customers').select('pricing_overrides').eq('email', email).limit(1)
    if (plusActive((curRows ?? [])[0]?.pricing_overrides ?? null)) {
      return NextResponse.json({ error: 'You already have an active Plus membership.' }, { status: 400 })
    }
  }

  // Price: intro only inside the window AND only for someone who has never had
  // Plus (account + phone here; the card is checked once Square has it, below).
  const pricing = await getPlusPricing(service)
  const accountEligible = pricing.isIntro && !acceptStandard &&
    await plusIntroEligible(service, { email, phones: [profile?.phone] })
  const cents = accountEligible ? pricing.introCents : pricing.standardCents

  // The customers row is where Plus is switched on. Make sure it exists BEFORE
  // charging — if it can't be created, stop here with nothing charged.
  const cust = await ensureCustomerRow(email, name, profile?.phone ?? null)
  if (!cust) {
    return NextResponse.json({ error: 'We couldn\'t set up your membership. You have not been charged. Please try again or text (832) 408-1631.' }, { status: 500 })
  }

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
    // then charge the stored card. On the accept-standard retry the card is
    // already saved — it must belong to THIS member's Square customer.
    let savedCardId: string | undefined
    let fingerprint: string | null = null
    if (sourceId) {
      const cardRes = await square.cardsApi.createCard({ idempotencyKey: randomUUID(), sourceId, card: { customerId: sqCustId } })
      savedCardId = cardRes.result.card?.id
      fingerprint = cardRes.result.card?.fingerprint ?? null
    } else {
      const got = await square.cardsApi.retrieveCard(retryCardId).catch(() => null)
      const c = got?.result.card
      if (c && c.customerId === sqCustId && c.enabled !== false) { savedCardId = c.id; fingerprint = c.fingerprint ?? null }
    }
    if (!savedCardId) return NextResponse.json({ error: 'Could not save your card.' }, { status: 400 })

    // Same physical card already paid for Plus on another account → standard
    // price. Never charge more than the page showed without asking: stop and
    // let them confirm.
    if (cents === pricing.introCents && cents !== pricing.standardCents && await plusCardUsedBefore(service, fingerprint)) {
      return NextResponse.json({
        code: 'returning_card',
        error: `This card has had Plus before, so the new-member price doesn't apply. Plus is $${(pricing.standardCents / 100).toFixed(0)}/year.`,
        priceCents: pricing.standardCents,
        savedCardId,
      }, { status: 409 })
    }

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

    // Activate membership on the customers row (created above, before the charge).
    const now = new Date()
    const startIso = now.toISOString()
    const expiresIso = isoPlusMonths(now, 12)
    const po: any = { ...((cust?.pricing_overrides) || {}) }
    po.plus = true
    po.plus_started_at = startIso
    po.plus_expires_at = expiresIso
    po.plus_auto_renew = true
    po.plus_comp = false
    const upd: any = { pricing_overrides: po }
    if (!cust.square_customer_id) upd.square_customer_id = sqCustId
    // A claim, not a fire-and-forget: if the row didn't actually change, the card
    // was charged and the member has no Plus — tell the owner loudly.
    const { data: activated, error: actErr } = await service
      .from('customers').update(upd).eq('id', cust.id).select('id')
    if (actErr || !activated?.length) {
      console.error('[account/plus] CRITICAL: charged but Plus not activated', actErr)
      try {
        await sendOwnerPush({
          title: 'Plus charged but NOT activated',
          body:  `${name} (${email}) paid $${(cents / 100).toFixed(2)} but Plus did not switch on. Square payment ${squarePaymentId}.`,
          url:   '/admin/plus',
          tag:   `plus-activate-fail-${cust.id}`,
        })
      } catch {}
      return NextResponse.json({ error: 'Your payment went through but your membership did not activate. We have been alerted and will fix it shortly.' }, { status: 500 })
    }
    await service.from('plus_payments').insert({
      customer_id: cust.id, customer_email: email, amount_cents: cents,
      square_payment_id: squarePaymentId, kind: 'signup', period_start: startIso, period_end: expiresIso,
      card_fingerprint: fingerprint,
    })

    try { await sendPlusReceiptEmail({ customerName: name, customerEmail: email, amountCents: cents, expiresAt: expiresIso }) } catch {}

    // Tell the owner. Before this, a Plus signup was silent: the money landed and
    // nobody knew until they went looking. Non-fatal; the member is already active.
    // `reason` comes from SaveWithPlusModal: they bought Plus to move/cancel a
    // booking inside 48h, which is worth knowing (a slot may be about to open).
    try {
      const why = body.reason === 'save-booking' ? ' · bought to save a booking inside 48h' : ''
      await sendOwnerPush({
        title: '⭐ New Plus member',
        body: `${name} · $${(cents / 100).toFixed(cents % 100 ? 2 : 0)}/yr${why}`,
        url: '/admin/plus',
        tag: `plus-signup-${cust.id}`,
      })
    } catch (e) { console.error('[account/plus] owner push failed (non-fatal):', e) }

    return NextResponse.json({ ok: true, expiresAt: new Date(expiresIso).getTime() })
  } catch (err: any) {
    const detail = err?.errors?.[0]?.detail || err?.message || 'Payment failed.'
    console.error('[account/plus] checkout error:', err)
    return NextResponse.json({ error: detail }, { status: 400 })
  }
}
