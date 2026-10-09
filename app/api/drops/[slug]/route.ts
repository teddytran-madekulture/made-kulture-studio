// Public — one Set Drop.
//   GET  → the drop as customers see it (+ the viewer's own deposit, if signed in)
//   POST → reserve: charge the deposit and record the pledge (sign-in required)
//
// ⚠️ The deposit amount and the promise are computed HERE, never taken from the
// browser. The page shows dropTerms() from the same settings; if the drop was
// edited after the page loaded, the sentence the customer ticked no longer
// matches and the request is refused — the stored terms must be exactly what
// they agreed to.

import { NextRequest, NextResponse } from 'next/server'
import { Client, Environment } from 'square'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { createClient as createServerClient } from '@/lib/supabase/server'
import { findOrCreateSquareCustomer } from '@/lib/square-customer'
import { refundPayment } from '@/lib/square-refund'
import { sendOwnerPush } from '@/lib/push'
import { rateLimit } from '@/lib/rate-limit'
import { getDrop, getPledges, sendPledgeReceipt, processRemaining } from '@/lib/set-drops-server'
import { dropPhase, dropProgress, dropTerms, depositFor, clampHours, depositorRate, dollars, type SetDrop, type DropPledge } from '@/lib/set-drops'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const square = () => new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN!,
  environment: process.env.SQUARE_ENVIRONMENT === 'production' ? Environment.Production : Environment.Sandbox,
})

/** What a visitor may see. Never other people's names or emails. */
function publicDrop(d: SetDrop, pledges: DropPledge[]) {
  const progress = dropProgress(d, pledges)
  return {
    slug: d.slug, name: d.name, tagline: d.tagline, description: d.description,
    hero_url: d.hero_url, gallery: d.gallery ?? [], video_url: d.video_url, video_hero: !!d.video_hero,
    phase: dropPhase(d),
    pre_reserve_ends_at: d.pre_reserve_ends_at, run_starts: d.run_starts, run_ends: d.run_ends,
    early_access_ends_at: d.early_access_ends_at,
    rate_per_hour: Number(d.rate_per_hour), min_hours: Number(d.min_hours), capacity: d.capacity,
    deposit_mode: d.deposit_mode, deposit_cents: d.deposit_cents, max_hours_per_pledge: Number(d.max_hours_per_pledge),
    perk_early_access: d.perk_early_access, early_access_hours: d.early_access_hours,
    perk_discount: d.perk_discount, discount_kind: d.discount_kind, discount_value: Number(d.discount_value), discount_scope: d.discount_scope,
    depositor_rate: depositorRate(d), bonus_credit_cents: d.bonus_credit_cents,
    cancel_policy: d.cancel_policy, goal_type: d.goal_type, show_goal: d.show_goal, open_call_id: d.open_call_id,
    // Progress: only when the goal is public. People count is always shown once
    // there are any (social proof), dollars never.
    progress: d.show_goal ? { label: progress.label, pct: progress.pct } : null,
    people: progress.people,
  }
}

async function sessionUser() {
  try {
    const { data } = await createServerClient().auth.getUser()
    return data.user ? { id: data.user.id, email: (data.user.email ?? '').toLowerCase() } : null
  } catch { return null }
}

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const db = supabaseAdmin()
  const drop = await getDrop(db, params.slug).catch(() => null)
  if (!drop || drop.status === 'draft') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const pledges = await getPledges(db, drop.id)
  const me = await sessionUser()
  const mine = me ? pledges.find(p => p.auth_user_id === me.id) ?? null : null
  let setSlug: string | null = null
  if (drop.set_id) {
    const { data: s } = await db.from('sets').select('slug').eq('id', drop.set_id).maybeSingle()
    setSlug = s?.slug ?? null
  }
  let openCall: { slug: string; title: string } | null = null
  if (drop.open_call_id) {
    const { data: oc } = await db.from('open_calls').select('slug, title').eq('id', drop.open_call_id).maybeSingle()
    openCall = oc ?? null
  }
  return NextResponse.json({
    drop: { ...publicDrop(drop, pledges), set_slug: setSlug, open_call: openCall },
    signedIn: !!me,
    mine: mine ? { hours_wanted: Number(mine.hours_wanted), deposit_cents: mine.deposit_cents, status: mine.status, timing_note: mine.timing_note } : null,
  })
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const me = await sessionUser()
  if (!me?.email) return NextResponse.json({ error: 'Please sign in to reserve.', code: 'sign_in_required' }, { status: 401 })

  const rl = await rateLimit(`drop-reserve:${me.id}`, 8, 60 * 60 * 1000, { failOpen: true })
  if (!rl.allowed) return NextResponse.json({ error: rl.message }, { status: 429 })

  const body = await req.json().catch(() => ({} as any))
  const db = supabaseAdmin()
  const drop = await getDrop(db, params.slug).catch(() => null)
  if (!drop) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (dropPhase(drop) !== 'pre_reserve') return NextResponse.json({ error: 'Reservations for this drop are closed.' }, { status: 400 })

  const hours = clampHours(drop, Number(body.hours))
  const cents = depositFor(drop, hours)
  const terms = dropTerms(drop, hours)
  if (body.agree !== true) return NextResponse.json({ error: 'Please tick the box to confirm what happens to your deposit.' }, { status: 400 })
  if (String(body.termsShown || '') !== terms.full) {
    return NextResponse.json({ error: 'The details of this drop just changed. Refresh the page to see the current terms — nothing was charged.', code: 'terms_changed' }, { status: 409 })
  }
  const timing = String(body.timingNote || '').trim().slice(0, 200) || null

  const { data: existing } = await db.from('set_drop_pledges').select('id, status').eq('drop_id', drop.id).eq('auth_user_id', me.id).maybeSingle()
  if (existing && existing.status !== 'refunded') return NextResponse.json({ error: 'You’ve already reserved this drop.' }, { status: 409 })
  if (existing) return NextResponse.json({ error: 'Text the studio at (832) 408-1631 to reserve again.' }, { status: 409 })

  const { data: profile } = await db.from('customer_profiles').select('full_name, phone, square_customer_id').eq('id', me.id).maybeSingle()
  const name = (profile?.full_name || String(body.name || '') || me.email.split('@')[0]).slice(0, 120)
  const phone = String(body.phone || profile?.phone || '').replace(/[^\d+]/g, '').slice(0, 20) || null

  let squareCustomerId: string | null = profile?.square_customer_id ?? null
  let cardId: string | null = null
  let paymentId: string | null = null

  if (cents > 0) {
    const sq = square()
    try {
      if (!squareCustomerId) {
        squareCustomerId = await findOrCreateSquareCustomer(sq, { email: me.email, name, phone })
        if (squareCustomerId) await db.from('customer_profiles').update({ square_customer_id: squareCustomerId }).eq('id', me.id).is('square_customer_id', null)
      }
      if (!squareCustomerId) return NextResponse.json({ error: 'Could not set up your payment profile — nothing was charged.' }, { status: 502 })

      if (body.savedCardId) {
        // Never trust a card id from the browser: it must belong to THIS member.
        const owned = await sq.cardsApi.listCards(undefined, squareCustomerId)
          .then(r => (r.result.cards ?? []).find(c => c.id === body.savedCardId && c.enabled) ?? null).catch(() => null)
        if (!owned?.id) return NextResponse.json({ error: 'That saved card is no longer available — please enter a card.' }, { status: 400 })
        cardId = owned.id
      } else if (body.sourceId) {
        const cr = await sq.cardsApi.createCard({ idempotencyKey: randomUUID(), sourceId: String(body.sourceId), card: { customerId: squareCustomerId } })
        cardId = cr.result.card?.id ?? null
      }
      if (!cardId) return NextResponse.json({ error: 'Card details are required.' }, { status: 400 })

      const pay = await sq.paymentsApi.createPayment({
        sourceId: cardId, customerId: squareCustomerId, idempotencyKey: randomUUID(),
        amountMoney: { amount: BigInt(cents), currency: 'USD' },
        locationId: process.env.SQUARE_LOCATION_ID!,
        note: `Made Kulture — Set Drop deposit — ${drop.name}`.slice(0, 500),
        buyerEmailAddress: me.email,
      })
      paymentId = pay.result.payment?.id ?? null
    } catch (err: any) {
      const detail = err?.errors?.[0]?.detail || err?.message || 'Payment failed.'
      console.error('[drops/reserve] payment error', err)
      return NextResponse.json({ error: `${detail} Nothing was charged.` }, { status: 400 })
    }
  }

  const { data: pledge, error } = await db.from('set_drop_pledges').insert({
    drop_id: drop.id, auth_user_id: me.id, customer_email: me.email, customer_name: name, phone,
    hours_wanted: hours, timing_note: timing, deposit_cents: cents,
    square_payment_id: paymentId, square_customer_id: squareCustomerId, square_card_id: cardId,
    agreed_terms: terms.full,
  }).select('*').single()

  if (error || !pledge) {
    // The card was charged but nothing recorded it. Give the money straight back.
    console.error('[drops/reserve] CRITICAL pledge insert failed after charge', error)
    let refunded = false
    if (paymentId) { try { await refundPayment({ paymentId, amountCents: cents, reason: 'Set Drop reservation failed to save' }); refunded = true } catch (e) { console.error('[drops/reserve] auto-refund failed', e) } }
    try { await sendOwnerPush({ title: 'Set Drop deposit problem', body: `${name} (${me.email}) — ${dollars(cents)} for ${drop.name}: the reservation didn’t save. ${refunded ? 'Refunded automatically.' : 'REFUND FAILED — check Square ' + paymentId}`, url: '/admin/drops', tag: `drop-fail-${me.id}` }) } catch {}
    return NextResponse.json({ error: refunded ? 'Something went wrong saving your reservation, so we refunded your card. Please try again.' : 'Your card was charged but the reservation didn’t save. We’ve been alerted and will sort it out.' }, { status: 500 })
  }

  // GO or CANCEL may have run between our phase check and this insert — then
  // this deposit missed the batch. Settle it now the same way the batch did.
  const after = await getDrop(db, drop.id).catch(() => null)
  if (after && after.status !== 'pre_reserve') {
    try { await processRemaining(db, drop.id) } catch (e) { console.error('[drops/reserve] late settle failed', e) }
    return NextResponse.json({ ok: true, late: true })
  }

  try { await sendPledgeReceipt(drop, pledge as DropPledge, terms.full) } catch {}
  try {
    const all = await getPledges(db, drop.id)
    const pr = dropProgress(drop, all)
    await sendOwnerPush({ title: `◇ ${drop.name}: new reservation`, body: `${name} · ${hours}h · ${dollars(cents)} — ${pr.label}`, url: '/admin/drops', tag: `drop-pledge-${pledge.id}` })
  } catch {}

  return NextResponse.json({ ok: true })
}
