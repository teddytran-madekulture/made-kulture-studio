// /api/account/nomad — the member side of Nomad (2026-10-25).
//   GET  → everything the member page shows.
//   POST → { action, ... } — start | cancel_membership | undo_cancel | update_card |
//          book | cancel_stay | approve_join | decline_join |
//          studio_block | cancel_block | visitor | cancel_visitor
// WHO is always the signed-in session; ids in the body are re-checked against
// it. Rules live in lib/nomad.ts.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendOwnerPush } from '@/lib/push'
import { sendMemberPush } from '@/lib/member-push'
import { sendSimpleEmail } from '@/lib/email'
import {
  getNomadSettings, membershipForUser, nightBalance, chargeDuesPeriod, chargeMember,
  overlappingStays, checkStay, issueStayDoorCode, mxToday, addDays, daysBetween, isDate,
  firstName, RULES_VERSION, LIVE_STATUSES, ACTIVE_STAY, squareCustomerFor, square, withLock, isLocked,
} from '@/lib/nomad'
import { isCardUsable } from '@/lib/card-expiry'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

async function sessionUser() {
  const { data: { user } } = await createClient().auth.getUser()
  return user
}

export async function GET() {
  const user = await sessionUser()
  if (!user?.email) return bad('Unauthorized', 401)
  const db = supabaseAdmin()
  try {
    const [s, m] = await Promise.all([getNomadSettings(db), membershipForUser(db, user.id)])
    const { data: apps } = await db.from('nomad_interest').select('status, created_at').eq('email', user.email.toLowerCase()).order('created_at', { ascending: false }).limit(1)
    const application = apps?.[0] ?? null
    const pub = {
      dues_cents: m?.dues_cents || s.dues_cents, nights_per_month: s.nights_per_month, night_cap: s.night_cap,
      extra_night_cents: s.extra_night_cents, busy_multiplier: s.busy_multiplier, busy_ranges: s.busy_ranges,
      max_nights_per_stay: s.max_nights_per_stay, max_members_at_once: s.max_members_at_once,
      booking_window_days: s.booking_window_days, free_cancel_days: s.free_cancel_days,
      check_in_hour: s.check_in_hour, check_out_hour: s.check_out_hour, studio_block_hours: s.studio_block_hours,
      studio_open_hour: s.studio_open_hour, studio_close_hour: s.studio_close_hour, max_visitors_per_day: s.max_visitors_per_day,
      house_name: s.house_name, house_address: m && LIVE_STATUSES.includes(m.status) ? s.house_address : '',
    }
    if (!m) return NextResponse.json({ membership: null, application, settings: pub })

    const today = mxToday()
    const balance = await nightBalance(db, m.id)
    const { data: myStaysRaw, error: msErr } = await db.from('nomad_stays').select('*').eq('membership_id', m.id).gte('check_out', addDays(today, -60)).order('check_in')
    if (msErr) throw new Error(msErr.message)
    const myStays = (myStaysRaw ?? []).map(x => ({
      ...x,
      // Live door code: shown only from 3 days before check-in through check-out.
      door_code: m.status === 'active' && x.status === 'confirmed' && daysBetween(today, x.check_in) <= 3 && x.check_out >= today ? x.door_code : null,
    }))
    const myIds = myStays.map(x => x.id)

    // Other members' upcoming stays (first names only).
    const { data: others, error: oErr } = await db.from('nomad_stays')
      .select('id, membership_id, check_in, check_out, visibility, share_with, status, host_stay_ids, nomad_memberships ( name )')
      .in('status', ACTIVE_STAY).neq('membership_id', m.id).gte('check_out', today).order('check_in')
    if (oErr) throw new Error(oErr.message)
    const calendar = (others ?? []).map((x: any) => ({
      id: x.id, check_in: x.check_in, check_out: x.check_out, status: x.status, who: firstName(x.nomad_memberships?.name),
      join: x.visibility === 'private' ? 'no' : (x.share_with || []).includes(m.id) ? 'instant' : x.visibility === 'any' ? 'request' : 'no',
    }))
    const joinRequests = (others ?? []).filter((x: any) => x.status === 'requested' && (x.host_stay_ids || []).some((h: string) => myIds.includes(h)))
      .map((x: any) => ({ id: x.id, who: firstName(x.nomad_memberships?.name), check_in: x.check_in, check_out: x.check_out }))

    const { data: mates } = await db.from('nomad_memberships').select('id, name').in('status', LIVE_STATUSES).neq('id', m.id)
    const members = (mates ?? []).map(x => ({ id: x.id, name: firstName(x.name) }))

    const upcomingIds = myStays.filter(x => x.status === 'confirmed' && x.check_out >= today).map(x => x.id)
    const maxDay = addDays(today, s.booking_window_days + s.max_nights_per_stay)
    const { data: blocks } = await db.from('nomad_studio_blocks').select('id, stay_id, membership_id, day, start_hour, hours').eq('status', 'booked').gte('day', today).lte('day', maxDay)
    const { data: visitors } = upcomingIds.length
      ? await db.from('nomad_visitors').select('*').in('stay_id', upcomingIds).eq('status', 'registered').order('day')
      : { data: [] as any[] }
    const studio = (blocks ?? []).map(b => ({ ...b, mine: b.membership_id === m.id }))

    return NextResponse.json({
      membership: {
        id: m.id, status: m.status, founding: m.founding, dues_cents: m.dues_cents || s.dues_cents, paid_through: m.paid_through,
        started_at: m.started_at, cancel_at_period_end: m.cancel_at_period_end, square_card_id: m.square_card_id, consented_at: m.consented_at,
      },
      application, settings: pub, balance, myStays, calendar, joinRequests, members, studio, visitors: visitors ?? [], today,
    })
  } catch (e: any) {
    console.error('[account/nomad] GET failed', e)
    // A failed read must never look like "no membership".
    return bad(e?.message || 'Could not load Nomad.', 500)
  }
}

export async function POST(req: NextRequest) {
  const user = await sessionUser()
  if (!user?.email) return bad('Unauthorized', 401)
  const body = await req.json().catch(() => ({} as any))
  const action = String(body.action || '')
  const db = supabaseAdmin()
  try {
    const s = await getNomadSettings(db)
    const m = await membershipForUser(db, user.id)
    if (!m) return bad('You’re not a Nomad member yet.', 403)
    const who = firstName(m.name || user.email)
    const today = mxToday()

    // The card the member picks for Nomad must be one of THEIR saved cards.
    const verifyCard = async (cardId: string) => {
      const custId = await squareCustomerFor(db, user.id)
      if (!custId) return 'Add a card in Payment methods first.'
      const cards = (await square().cardsApi.listCards(undefined, custId)).result.cards ?? []
      const card = cards.find(c => c.id === cardId)
      if (!card) return 'That card isn’t on your account.'
      if (!isCardUsable(card)) return 'That card is expired. Pick another or add a new one.'
      return null
    }

    if (action === 'start') {
      if (m.status !== 'pending' && m.status !== 'ended') return bad('Your membership is already set up.')
      if (body.agree !== true) return bad('Please agree to the house rules and the monthly charge.')
      const cardId = String(body.cardId || '')
      const cardErr = await verifyCard(cardId)
      if (cardErr) return bad(cardErr)
      // CLAIM: flip pending/ended → 'starting' first, so a double tap can't charge twice.
      const { data: claimed, error: cErr } = await db.from('nomad_memberships')
        .update({ status: 'starting', square_card_id: cardId, consented_at: new Date().toISOString(), rules_version: RULES_VERSION, cancel_at_period_end: false, ended_at: null })
        .eq('id', m.id).in('status', ['pending', 'ended']).select('*')
      if (cErr || !claimed?.length) return bad('Could not start the membership. Refresh and try again.', 409)
      const res = await chargeDuesPeriod(db, claimed[0], s, new Date().toISOString(), today.replace(/-/g, ''))
      if (!res.ok) {
        await db.from('nomad_memberships').update({ status: m.status }).eq('id', m.id).eq('status', 'starting')
        return bad(`The card was declined: ${res.error}`, 402)
      }
      await sendOwnerPush({ title: 'Nomad: new member', body: `${m.name || user.email} started their membership ($${(res.cents / 100).toFixed(0)}).`, url: '/admin/nomad', tag: `nomad-start-${m.id}` }).catch(() => {})
      return NextResponse.json({ ok: true })
    }

    if (action === 'update_card') {
      const cardId = String(body.cardId || '')
      const cardErr = await verifyCard(cardId)
      if (cardErr) return bad(cardErr)
      const { data, error } = await db.from('nomad_memberships').update({ square_card_id: cardId, consented_at: new Date().toISOString() }).eq('id', m.id).select('*')
      if (error || !data?.length) return bad('Card not saved.', 500)
      // Behind on dues? Try the new card right away instead of waiting for tomorrow's run.
      const fresh = data[0]
      if (['past_due', 'paused'].includes(fresh.status) && fresh.paid_through && Date.parse(fresh.paid_through) <= Date.now()) {
        const res = await chargeDuesPeriod(db, fresh, s, fresh.paid_through, today.replace(/-/g, ''))
        if (!res.ok) return bad(`Card saved, but it was declined for this month: ${res.error}`, 402)
        await sendOwnerPush({ title: 'Nomad: member caught up', body: `${m.name || user.email} paid with a new card.`, url: '/admin/nomad' }).catch(() => {})
        return NextResponse.json({ ok: true, charged: true })
      }
      return NextResponse.json({ ok: true })
    }

    if (action === 'cancel_membership' || action === 'undo_cancel') {
      const on = action === 'cancel_membership'
      const { data, error } = await db.from('nomad_memberships').update({ cancel_at_period_end: on }).eq('id', m.id).in('status', LIVE_STATUSES).select('id')
      if (error || !data?.length) return bad('Nothing to change.', 409)
      if (on) await sendOwnerPush({ title: 'Nomad: member cancelling', body: `${m.name || user.email} cancelled. It ends when the paid month runs out.`, url: '/admin/nomad', tag: `nomad-cancel-${m.id}` }).catch(() => {})
      return NextResponse.json({ ok: true })
    }

    const houseAction = async (): Promise<NextResponse> => {
    if (action === 'book') {
      if (!m.consented_at) return bad('Start your membership first.')
      const checkIn = String(body.checkIn || ''), checkOut = String(body.checkOut || '')
      const visibility = String(body.visibility || 'chosen')
      const overlapping = await overlappingStays(db, checkIn, checkOut)
      const { data: mine, error: mErr } = await db.from('nomad_stays').select('id, check_in').eq('membership_id', m.id).in('status', ACTIVE_STAY).gte('check_in', addDays(today, 1))
      if (mErr) throw new Error(mErr.message)
      const chk = checkStay({ m, s, checkIn, checkOut, visibility, overlapping, myUpcoming: mine ?? [] })
      if (!chk.ok) return bad(chk.error)

      // Share list: only other LIVE members' ids survive.
      let shareWith: string[] = Array.isArray(body.shareWith) ? body.shareWith.map(String) : []
      if (shareWith.length) {
        const { data: live } = await db.from('nomad_memberships').select('id').in('id', shareWith).in('status', LIVE_STATUSES)
        shareWith = (live ?? []).map(x => x.id).filter(id => id !== m.id)
      }

      const balance = await nightBalance(db, m.id)
      const fromBank = Math.min(Math.max(balance, 0), chk.cost)
      const extra = chk.cost - fromBank
      const extraCents = extra * s.extra_night_cents
      // Extra nights need an explicit yes. Instant bookings are charged now;
      // a request that needs a host's OK is charged when it's approved.
      if (extra > 0 && body.acceptExtra !== true) {
        return NextResponse.json({ needsExtra: true, extraNights: extra, extraCents, fromBank, cost: chk.cost }, { status: 409 })
      }
      const { data: stayRows, error: sErr } = await db.from('nomad_stays').insert({
        membership_id: m.id, check_in: checkIn, check_out: checkOut, visibility, share_with: shareWith,
        status: chk.status, host_stay_ids: chk.hostStayIds, nights_cost: fromBank, extra_nights: extra, extra_cents: extraCents,
        notes: String(body.notes || '').slice(0, 1000) || null,
      }).select('*')
      if (sErr || !stayRows?.length) return bad(`Could not save the stay: ${sErr?.message || 'no row'}`, 500)
      const stay = stayRows[0]
      if (fromBank > 0) {
        const { error: nErr } = await db.from('nomad_nights').insert({ membership_id: m.id, delta: -fromBank, reason: 'stay', stay_id: stay.id })
        if (nErr) { await db.from('nomad_stays').delete().eq('id', stay.id); return bad('Could not take the nights from your bank. Nothing was booked.', 500) }
      }
      if (chk.status === 'confirmed' && extraCents > 0) {
        const pay = await chargeMember(db, m, extraCents, `Nomad extra nights ${checkIn}`, `x${String(stay.id).replace(/-/g, '').slice(0, 12)}${today.replace(/-/g, '')}`)
        await db.from('nomad_charges').insert({ membership_id: m.id, kind: 'extra_nights', amount_cents: extraCents, stay_id: stay.id, status: pay.ok ? 'charged' : 'failed', square_payment_id: pay.ok ? pay.paymentId : null, error: pay.ok ? null : pay.error })
        if (!pay.ok) {
          // Roll back rather than leave an unpaid confirmed stay.
          await db.from('nomad_stays').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', stay.id)
          if (fromBank > 0) await db.from('nomad_nights').insert({ membership_id: m.id, delta: fromBank, reason: 'stay_refund', stay_id: stay.id, note: 'extra-night charge failed' })
          return bad(`The card was declined for the extra nights: ${pay.error}. Nothing was booked.`, 402)
        }
      }
      if (chk.status === 'confirmed') {
        await issueStayDoorCode(db, stay, s, who)
        await sendOwnerPush({ title: 'Nomad: stay booked', body: `${who} · ${checkIn} to ${checkOut}`, url: '/admin/nomad', tag: `nomad-stay-${stay.id}` }).catch(() => {})
      } else {
        // Ask each host. Names and dates only — never codes.
        const { data: hosts } = await db.from('nomad_stays').select('id, nomad_memberships ( auth_user_id, email, name )').in('id', chk.hostStayIds)
        for (const h of hosts ?? []) {
          const hm: any = (h as any).nomad_memberships
          if (hm?.auth_user_id) await sendMemberPush(hm.auth_user_id, { title: 'Nomad: someone wants to join your stay', body: `${who} asked to stay ${checkIn} to ${checkOut}.`, url: '/account/nomad', tag: `nomad-join-${stay.id}` }).catch(() => 0)
          if (hm?.email) await sendSimpleEmail({ to: hm.email, label: 'nomad_join_request', subject: `${who} wants to join your Nomad stay`, heading: 'A join request', paragraphs: [`${who} asked to stay at the house ${checkIn} to ${checkOut}, overlapping your stay. Approve or decline it in your account.`], ctaText: 'Review the request', ctaUrl: `${APP_URL}/account/nomad` }).catch(() => {})
        }
      }
      return NextResponse.json({ ok: true, status: chk.status, fromBank, extra })
    }

    if (action === 'approve_join' || action === 'decline_join') {
      const { data: req0 } = await db.from('nomad_stays').select('*, nomad_memberships ( * )').eq('id', String(body.stayId || '')).eq('status', 'requested').maybeSingle()
      if (!req0) return bad('That request is no longer waiting.', 404)
      const { data: myHostStays } = await db.from('nomad_stays').select('id').eq('membership_id', m.id).in('id', req0.host_stay_ids || [])
      if (!myHostStays?.length) return bad('That request isn’t for your stay.', 403)
      const guestM: any = (req0 as any).nomad_memberships
      if (action === 'decline_join') {
        const { data: claimed } = await db.from('nomad_stays').update({ status: 'declined', cancelled_at: new Date().toISOString() }).eq('id', req0.id).eq('status', 'requested').select('id')
        if (!claimed?.length) return bad('Already handled.', 409)
        if (req0.nights_cost > 0) await db.from('nomad_nights').insert({ membership_id: req0.membership_id, delta: req0.nights_cost, reason: 'stay_refund', stay_id: req0.id, note: 'join declined' })
        if (guestM?.auth_user_id) await sendMemberPush(guestM.auth_user_id, { title: 'Nomad: request declined', body: `Your stay ${req0.check_in} to ${req0.check_out} wasn’t approved. Your nights are back in your bank.`, url: '/account/nomad' }).catch(() => 0)
        return NextResponse.json({ ok: true })
      }
      // Approve: drop this host from the list; confirm once no host is left.
      const remaining = (req0.host_stay_ids || []).filter((h: string) => !myHostStays.some(x => x.id === h))
      if (remaining.length) {
        const { error } = await db.from('nomad_stays').update({ host_stay_ids: remaining }).eq('id', req0.id).eq('status', 'requested')
        if (error) return bad(error.message, 500)
        return NextResponse.json({ ok: true, waitingOn: remaining.length })
      }
      // CLAIM first (requested → confirming), so a cancel/expiry/other host
      // can't slip in between the charge and the confirmation.
      const { data: claimedReq } = await db.from('nomad_stays').update({ status: 'confirming' }).eq('id', req0.id).eq('status', 'requested').select('*')
      if (!claimedReq?.length) return bad('Already handled.', 409)
      const backToRequested = (patch: any = {}) => db.from('nomad_stays').update({ status: 'requested', ...patch }).eq('id', req0.id).eq('status', 'confirming')
      // Re-run every booking rule against who is confirmed NOW.
      const confirmedNow = (await overlappingStays(db, req0.check_in, req0.check_out, req0.id)).filter(x => x.status !== 'requested')
      const recheck = checkStay({ m: guestM, s, checkIn: req0.check_in, checkOut: req0.check_out, visibility: req0.visibility, overlapping: confirmedNow, myUpcoming: [] })
      if (!recheck.ok) {
        await db.from('nomad_stays').update({ status: 'declined', cancelled_at: new Date().toISOString() }).eq('id', req0.id).eq('status', 'confirming')
        if (req0.nights_cost > 0) await db.from('nomad_nights').insert({ membership_id: req0.membership_id, delta: req0.nights_cost, reason: 'stay_refund', stay_id: req0.id, note: 'no longer fits' })
        if (guestM?.auth_user_id) await sendMemberPush(guestM.auth_user_id, { title: 'Nomad: request couldn’t go through', body: `The house no longer fits your stay ${req0.check_in} to ${req0.check_out}. Your nights are back in your bank.`, url: '/account/nomad' }).catch(() => 0)
        return bad(`It can't be confirmed anymore: ${recheck.error} They've been told and their nights returned.`, 409)
      }
      if ((recheck.hostStayIds || []).length) {
        // Someone new (open to any member) booked those dates since — they must OK it too.
        await backToRequested({ host_stay_ids: recheck.hostStayIds })
        return NextResponse.json({ ok: true, waitingOn: recheck.hostStayIds!.length })
      }
      if (req0.extra_cents > 0) {
        const pay = await chargeMember(db, guestM, req0.extra_cents, `Nomad extra nights ${req0.check_in}`, `x${String(req0.id).replace(/-/g, '').slice(0, 12)}${today.replace(/-/g, '')}`)
        await db.from('nomad_charges').insert({ membership_id: req0.membership_id, kind: 'extra_nights', amount_cents: req0.extra_cents, stay_id: req0.id, status: pay.ok ? 'charged' : 'failed', square_payment_id: pay.ok ? pay.paymentId : null, error: pay.ok ? null : pay.error })
        if (!pay.ok) {
          await backToRequested()
          if (guestM?.auth_user_id) await sendMemberPush(guestM.auth_user_id, { title: 'Nomad: card declined', body: 'Your join was approved but the card for extra nights was declined. Update your card in Nomad.', url: '/account/nomad' }).catch(() => 0)
          return bad('Approved, but their card was declined for the extra nights, so it isn’t confirmed yet. They’ve been told to update their card.', 402)
        }
      }
      const { data: claimed } = await db.from('nomad_stays').update({ status: 'confirmed', host_stay_ids: [] }).eq('id', req0.id).eq('status', 'confirming').select('*')
      if (!claimed?.length) { console.error('[nomad] CRITICAL: join charged but not confirmed', req0.id); return bad('Something went wrong confirming it. The studio has been alerted.', 500) }
      await issueStayDoorCode(db, claimed[0], s, firstName(guestM?.name))
      if (guestM?.auth_user_id) await sendMemberPush(guestM.auth_user_id, { title: 'Nomad: you’re in', body: `Your stay ${req0.check_in} to ${req0.check_out} is confirmed.`, url: '/account/nomad' }).catch(() => 0)
      await sendOwnerPush({ title: 'Nomad: shared stay confirmed', body: `${firstName(guestM?.name)} joins ${who} · ${req0.check_in} to ${req0.check_out}`, url: '/admin/nomad' }).catch(() => {})
      return NextResponse.json({ ok: true })
    }

    if (action === 'cancel_stay') {
      const { data: stay } = await db.from('nomad_stays').select('*').eq('id', String(body.stayId || '')).eq('membership_id', m.id).in('status', ACTIVE_STAY).maybeSingle()
      if (!stay) return bad('Stay not found.', 404)
      if (stay.check_in <= today) return bad('That stay has started. Message the studio to change it.')
      const { data: claimed } = await db.from('nomad_stays').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', stay.id).in('status', ACTIVE_STAY).select('id')
      if (!claimed?.length) return bad('Already cancelled.', 409)
      const early = daysBetween(today, stay.check_in) >= s.free_cancel_days || stay.status === 'requested'
      // Early: every night comes back. Paid extra nights come back as bank
      // nights (requests were never charged, so only their bank nights return).
      const back = early ? stay.nights_cost + (stay.status === 'confirmed' ? stay.extra_nights : 0) : 0
      if (back > 0) await db.from('nomad_nights').insert({ membership_id: m.id, delta: back, reason: 'stay_refund', stay_id: stay.id })
      await db.from('nomad_studio_blocks').update({ status: 'cancelled' }).eq('stay_id', stay.id)
      await db.from('nomad_visitors').update({ status: 'cancelled' }).eq('stay_id', stay.id)
      // Anyone waiting on this stay's OK no longer needs it.
      const { data: waiting } = await db.from('nomad_stays').select('id, host_stay_ids').eq('status', 'requested').contains('host_stay_ids', [stay.id])
      for (const w of waiting ?? []) {
        const left = (w.host_stay_ids || []).filter((h: string) => h !== stay.id)
        if (left.length) { await db.from('nomad_stays').update({ host_stay_ids: left }).eq('id', w.id).eq('status', 'requested'); continue }
        // Nobody left to approve it: release it (nights back) so it can't sit stuck.
        const { data: rel } = await db.from('nomad_stays').update({ status: 'declined', cancelled_at: new Date().toISOString(), host_stay_ids: [] }).eq('id', w.id).eq('status', 'requested').select('id, membership_id, nights_cost, check_in, check_out, nomad_memberships ( auth_user_id )')
        const r0: any = rel?.[0]
        if (!r0) continue
        if (r0.nights_cost > 0) await db.from('nomad_nights').insert({ membership_id: r0.membership_id, delta: r0.nights_cost, reason: 'stay_refund', stay_id: r0.id, note: 'host cancelled' })
        if (r0.nomad_memberships?.auth_user_id) await sendMemberPush(r0.nomad_memberships.auth_user_id, { title: 'Nomad: the stay you asked to join was cancelled', body: `Your nights are back. ${r0.check_in} to ${r0.check_out} may now be open to book directly.`, url: '/account/nomad' }).catch(() => 0)
      }
      await sendOwnerPush({ title: 'Nomad: stay cancelled', body: `${who} · ${stay.check_in} to ${stay.check_out}${back ? ` · ${back} nights returned` : ' · late, nights kept'}`, url: '/admin/nomad' }).catch(() => {})
      return NextResponse.json({ ok: true, nightsBack: back })
    }
    return bad('Unknown action')
    }
    if (['book', 'approve_join', 'decline_join', 'cancel_stay'].includes(action)) {
      const r = await withLock(db, 'house', houseAction)
      if (isLocked(r)) return bad('Someone else is booking right now. Try again in a few seconds.', 409)
      return r
    }

    // ── Studio blocks & visitors: must belong to the member's own confirmed stay ──
    const ownStay = async () => {
      const { data } = await db.from('nomad_stays').select('*').eq('id', String(body.stayId || '')).eq('membership_id', m.id).eq('status', 'confirmed').maybeSingle()
      return data
    }

    if (action === 'studio_block') {
      const stay = await ownStay()
      if (!stay) return bad('Pick one of your confirmed stays.')
      const day = String(body.day || ''), start = Math.round(Number(body.startHour))
      const len = s.studio_block_hours
      if (!isDate(day) || day < stay.check_in || day > stay.check_out) return bad('Pick a day during your stay.')
      if (day < today) return bad('That day has passed.')
      if (!(start >= s.studio_open_hour && start + len <= s.studio_close_hour)) return bad(`Studio blocks run ${s.studio_open_hour}:00 to ${s.studio_close_hour}:00.`)
      const { data: dayBlocks, error } = await db.from('nomad_studio_blocks').select('*').eq('day', day).eq('status', 'booked')
      if (error) throw new Error(error.message)
      if ((dayBlocks ?? []).some(b => start < b.start_hour + b.hours && b.start_hour < start + len)) return bad('That time overlaps another booking.')
      const mineToday = (dayBlocks ?? []).filter(b => b.membership_id === m.id).length
      if (mineToday >= 2) return bad('Two blocks a day max.')
      if (mineToday >= 1) {
        const othersHere = (await overlappingStays(db, day, addDays(day, 1))).filter(x => x.status === 'confirmed' && x.membership_id !== m.id)
        const othersWithBlock = new Set((dayBlocks ?? []).filter(b => b.membership_id !== m.id).map(b => b.membership_id))
        if (othersHere.some(x => !othersWithBlock.has(x.membership_id))) return bad('Someone else in the house hasn’t had a studio block that day yet. One each first.')
      }
      const { data: row, error: insErr } = await db.from('nomad_studio_blocks').insert({ stay_id: stay.id, membership_id: m.id, day, start_hour: start, hours: len }).select('id')
      if (insErr || !row?.length) return bad('Not booked.', 500)
      return NextResponse.json({ ok: true })
    }

    if (action === 'cancel_block') {
      const { data, error } = await db.from('nomad_studio_blocks').update({ status: 'cancelled' }).eq('id', String(body.blockId || '')).eq('membership_id', m.id).eq('status', 'booked').select('id')
      if (error || !data?.length) return bad('Not found.', 404)
      return NextResponse.json({ ok: true })
    }

    if (action === 'visitor') {
      const stay = await ownStay()
      if (!stay) return bad('Pick one of your confirmed stays.')
      const day = String(body.day || '')
      const name = String(body.name || '').trim().slice(0, 120)
      if (!name) return bad('Add the visitor’s name.')
      if (!isDate(day) || day < stay.check_in || day > stay.check_out) return bad('Pick a day during your stay.')
      if (day <= today) return bad('Register visitors by the day before.')
      const { count, error } = await db.from('nomad_visitors').select('id', { count: 'exact', head: true }).eq('day', day).eq('status', 'registered')
      if (error) throw new Error(error.message)
      if ((count ?? 0) >= s.max_visitors_per_day) return bad(`The house allows ${s.max_visitors_per_day} visitors a day, and that day is full.`)
      const { data: row, error: insErr } = await db.from('nomad_visitors').insert({
        stay_id: stay.id, membership_id: m.id, day, name, role: String(body.role || '').slice(0, 60) || null, phone: String(body.phone || '').slice(0, 40) || null,
      }).select('id')
      if (insErr || !row?.length) return bad('Not saved.', 500)
      await sendOwnerPush({ title: 'Nomad: visitor registered', body: `${who} · ${name} on ${day}`, url: '/admin/nomad' }).catch(() => {})
      return NextResponse.json({ ok: true })
    }

    if (action === 'cancel_visitor') {
      const { data, error } = await db.from('nomad_visitors').update({ status: 'cancelled' }).eq('id', String(body.visitorId || '')).eq('membership_id', m.id).eq('status', 'registered').select('id')
      if (error || !data?.length) return bad('Not found.', 404)
      return NextResponse.json({ ok: true })
    }

    return bad('Unknown action')
  } catch (e: any) {
    console.error('[account/nomad] POST failed', action, e)
    return bad(e?.message || 'Something went wrong.', 500)
  }
}
