import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { Client, Environment } from 'square'
import { sendOwnerPush } from '@/lib/push'

// 2026-10-07 — customer self-service account deletion.
// Apple requires it (App Store guideline 5.1.1(v)) for any app with sign-up.
//
// What goes:   the login (auth user) and everything keyed to it — profile,
//              directory listing, portfolio, messages, follows, castings,
//              store credit, push subscriptions (all ON DELETE CASCADE) —
//              plus every saved card in Square (disabled).
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
  const { data: custRows, error: cErr } = email
    ? await service.from('customers').select('id').eq('email', email)
    : { data: [] as { id: string }[], error: null }
  if (cErr) return NextResponse.json({ error: 'Could not check your bookings. Please try again.' }, { status: 500 })
  const custIds = (custRows ?? []).map(c => c.id)
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
    body: `${prof?.full_name || 'A customer'} (${email || 'no email'}) deleted their account — ${cardNote}. Booking history kept.`,
    tag: 'account-delete',
  }).catch(() => {})

  return NextResponse.json({ ok: true })
}
