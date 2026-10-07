import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { Client, Environment } from 'square'
import { sendOwnerPush } from '@/lib/push'
import { getCreditBalance } from '@/lib/credits'
import { plusActive } from '@/lib/short-notice'

// 2026-10-07 — customer self-service account deletion.
// Apple requires it (App Store guideline 5.1.1(v)) for any app with sign-up.
//
// What goes:   the login (auth user) and everything keyed to it — profile,
//              directory listing, portfolio, messages, follows, castings,
//              store credit, push subscriptions (all ON DELETE CASCADE) —
//              plus every saved card in Square (disabled).
// Plus:        auto-renew is switched OFF (no more charges or renewal texts);
//              the paid-through date is left alone, so Plus is still there if
//              they come back with the same email before it runs out. No refund.
// Credit:      forfeited (the ledger cascades). The balance is shown on the
//              confirm screen first and reported in the owner push.
// What stays:  the `customers` row and its bookings. Those are the studio's
//              transaction records (tax, disputes, Square reconciliation) and
//              were never part of the login; they're keyed by email.
//
// Refused while the customer still has an upcoming booking (door codes, holds
// and charges are tied to it) or is on the studio team (worker_profiles).

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function getSquare() {
  return new Client({
    accessToken: process.env.SQUARE_ACCESS_TOKEN!,
    environment: process.env.SQUARE_ENVIRONMENT === 'production' ? Environment.Production : Environment.Sandbox,
  })
}

type CustRow = { id: string; pricing_overrides: any }

async function customerRows(email: string): Promise<{ rows: CustRow[]; error: boolean }> {
  if (!email) return { rows: [], error: false }
  const { data, error } = await service.from('customers').select('id, pricing_overrides').eq('email', email)
  return { rows: (data ?? []) as CustRow[], error: !!error }
}

function plusSummary(rows: CustRow[]): { active: boolean; expiresAt: string | null } {
  const row = rows.find(r => plusActive(r.pricing_overrides))
  return { active: !!row, expiresAt: row?.pricing_overrides?.plus_expires_at ?? null }
}

const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`

// What the customer is about to give up — shown on the confirm screen.
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { rows } = await customerRows((user.email ?? '').toLowerCase())
  const creditCents = Math.max(0, await getCreditBalance(user.id))
  return NextResponse.json({ creditCents, plus: plusSummary(rows) })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Please log in again.' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  if (String(body?.confirm ?? '').trim().toUpperCase() !== 'DELETE') {
    return NextResponse.json({ error: 'Type DELETE to confirm.' }, { status: 400 })
  }

  const email = (user.email ?? '').toLowerCase()

  // ── Gate 1: studio team accounts close through Teddy, not here.
  const { data: worker, error: wErr } = await service
    .from('worker_profiles').select('id').eq('account_id', user.id).maybeSingle()
  if (wErr) return NextResponse.json({ error: 'Could not check your account. Please try again.' }, { status: 500 })
  if (worker) {
    return NextResponse.json({
      error: "You're on the Made Kulture team, so this account has to be closed by the studio. Email info@madekulture.com and we'll take care of it.",
    }, { status: 409 })
  }

  // ── Gate 2: no upcoming bookings. A failed lookup must REFUSE, never pass.
  const { rows: custRows, error: cErr } = await customerRows(email)
  if (cErr) return NextResponse.json({ error: 'Could not check your bookings. Please try again.' }, { status: 500 })
  const custIds = custRows.map(c => c.id)
  const orFilter = [`auth_user_id.eq.${user.id}`]
  if (custIds.length) orFilter.push(`customer_id.in.(${custIds.join(',')})`)

  const { data: upcoming, error: bErr } = await service
    .from('bookings')
    .select('id')
    .or(orFilter.join(','))
    .in('status', ['pending', 'confirmed'])
    .gt('end_time', new Date().toISOString())
    .limit(1)
  if (bErr) return NextResponse.json({ error: 'Could not check your bookings. Please try again.' }, { status: 500 })
  if (upcoming && upcoming.length) {
    return NextResponse.json({
      error: 'You have an upcoming booking. Cancel it or wait until it’s finished, then you can delete your account.',
    }, { status: 409 })
  }

  // Details for the owner alert, read before anything is removed.
  const { data: prof } = await service
    .from('customer_profiles').select('full_name, square_customer_id').eq('id', user.id).maybeSingle()

  // Credit balance and Plus status, captured for the owner's record before the
  // ledger cascades away.
  const creditCents = Math.max(0, await getCreditBalance(user.id))
  const plus = plusSummary(custRows)

  // ── Plus: stop auto-renew on every customer row that has it on. Must land
  //    BEFORE the delete — otherwise the renewal job would try to charge a card
  //    that's about to be removed. A failed write refuses the whole delete.
  for (const r of custRows) {
    const po = r.pricing_overrides
    if (!po || po.plus_auto_renew !== true) continue
    const { data: upd, error: pErr } = await service
      .from('customers')
      .update({ pricing_overrides: { ...po, plus_auto_renew: false } })
      .eq('id', r.id)
      .select('id')
    if (pErr || !upd?.length) {
      console.error('[account/delete] Plus auto-renew off failed:', pErr)
      return NextResponse.json({ error: 'Could not delete your account. Please try again or email info@madekulture.com.' }, { status: 500 })
    }
  }

  // ── Saved cards: disable every card on the Square customer. Non-fatal, but
  //    a failure is reported to the owner so it can be cleaned up by hand.
  let cardNote = 'no saved cards'
  if (prof?.square_customer_id) {
    try {
      const square = getSquare()
      const res = await square.cardsApi.listCards(undefined, prof.square_customer_id)
      const cards = (res.result.cards ?? []).filter(c => c.enabled && c.id)
      for (const c of cards) await square.cardsApi.disableCard(c.id!)
      cardNote = `${cards.length} saved card${cards.length === 1 ? '' : 's'} removed`
    } catch (e: any) {
      console.error('[account/delete] Square card disable failed:', e)
      cardNote = `⚠ saved cards NOT removed (Square customer ${prof.square_customer_id}) — remove by hand`
    }
  }

  // ── Keep the booking history but unlink it from the login, so a foreign key
  //    on bookings.auth_user_id can't block (or cascade into) the delete.
  const { error: unlinkErr } = await service
    .from('bookings').update({ auth_user_id: null }).eq('auth_user_id', user.id)
  if (unlinkErr) {
    console.error('[account/delete] unlink bookings failed:', unlinkErr)
    return NextResponse.json({ error: 'Could not delete your account. Please try again or email info@madekulture.com.' }, { status: 500 })
  }

  // ── Delete the login. Everything keyed to it cascades.
  const { error: delErr } = await service.auth.admin.deleteUser(user.id)
  if (delErr) {
    console.error('[account/delete] deleteUser failed:', delErr)
    await sendOwnerPush({
      title: 'Account deletion FAILED',
      body: `${prof?.full_name || email} tried to delete their account: ${delErr.message}`,
      tag: 'account-delete',
    }).catch(() => {})
    return NextResponse.json({ error: 'Could not delete your account. Please try again or email info@madekulture.com.' }, { status: 500 })
  }

  // Customer profile is normally gone via cascade; remove it explicitly in
  // case that table's FK was created without one.
  await service.from('customer_profiles').delete().eq('id', user.id)

  // Clear the now-dead session cookies.
  await supabase.auth.signOut({ scope: 'local' }).catch(() => {})

  await sendOwnerPush({
    title: 'Account deleted',
    body: `${prof?.full_name || 'A customer'} (${email || 'no email'}) deleted their account — ${cardNote}`
      + (creditCents > 0 ? `, ${money(creditCents)} credit forfeited` : '')
      + (plus.active ? `, Plus auto-renew off (paid through ${plus.expiresAt ? new Date(plus.expiresAt).toLocaleDateString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' }) : 'no end date'})` : '')
      + '. Booking history kept.',
    tag: 'account-delete',
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
