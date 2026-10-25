// GET /api/cron/nomad — the daily Nomad job (2026-10-25). Bearer CRON_SECRET,
// scheduled via pg_cron like plus-renew. Safe to run more than once a day:
// every write is a claim or is idempotent.
//
//  1. Ends memberships whose member cancelled, once the paid month runs out.
//  2. Charges dues on the renewal date (saved card the member consented to).
//     Declined → past_due + ONE payment link per period. Still unpaid after
//     the grace days → paused (Plus off, no new bookings).
//  3. Keeps Plus in sync with every membership's state.
//  4. Expires join requests whose check-in has arrived (nights go back).
//  5. Sends the pre-arrival email 2 days before check-in (never the door code).
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { sendOwnerPush } from '@/lib/push'
import { sendMemberPush } from '@/lib/member-push'
import { sendSimpleEmail } from '@/lib/email'
import {
  getNomadSettings, chargeDuesPeriod, paymentLink, syncPlus, mxToday, addDays, firstName, LIVE_STATUSES, issueStayDoorCode,
} from '@/lib/nomad'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const maxDuration = 60

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')

export async function GET(req: NextRequest) {
  // Fail CLOSED when the secret is unset (same as the other crons).
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = supabaseAdmin()
  const s = await getNomadSettings(db)
  const now = Date.now()
  const today = mxToday()
  const out = { ended: 0, charged: 0, declined: 0, links: 0, paused: 0, plusSynced: 0, requestsExpired: 0, reminders: 0, doorCodes: 0, errors: [] as string[] }

  const { data: members, error } = await db.from('nomad_memberships').select('*').in('status', [...LIVE_STATUSES, 'paused'])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  for (const m of members ?? []) {
    try {
      const due = m.paid_through && Date.parse(m.paid_through) <= now
      const who = m.name || m.email

      // 1. Cancelled and the paid month is over → end it.
      if (LIVE_STATUSES.includes(m.status) && due && m.cancel_at_period_end) {
        const { data: claimed } = await db.from('nomad_memberships').update({ status: 'ended', ended_at: new Date().toISOString() }).eq('id', m.id).in('status', LIVE_STATUSES).select('*')
        if (claimed?.length) {
          out.ended++
          await syncPlus(db, claimed[0]).catch(e => out.errors.push(`plus ${m.id}: ${e.message}`))
          // Future stays end with the membership (nights are not refunded as cash).
          await db.from('nomad_stays').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('membership_id', m.id).in('status', ['confirmed', 'requested']).gt('check_in', today)
          await sendOwnerPush({ title: 'Nomad: membership ended', body: `${who} (cancelled, paid month ran out).`, url: '/admin/nomad' }).catch(() => {})
        }
        continue
      }

      // 2. Renewal due → charge.
      if (LIVE_STATUSES.includes(m.status) && due) {
        const res = await chargeDuesPeriod(db, m, s, m.paid_through, today.replace(/-/g, ''))
        if (res.ok) {
          out.charged++
          if (m.email) await sendSimpleEmail({
            to: m.email, label: 'nomad_dues_receipt', subject: 'Your Nomad membership renewed', heading: 'Membership renewed',
            paragraphs: [`Your Nomad membership renewed for <strong style="color:#fff;">$${(res.cents / 100).toFixed(2)}</strong>.${res.accrued ? ` ${res.accrued} nights were added to your bank.` : ''}`],
            ctaText: 'Open Nomad', ctaUrl: `${APP_URL}/account/nomad`,
          }).catch(() => {})
          continue
        }
        if (res.skipped) continue // another caller is charging this period right now
        out.declined++
        if (m.status === 'active') {
          await db.from('nomad_memberships').update({ status: 'past_due', past_due_since: new Date().toISOString() }).eq('id', m.id).eq('status', 'active')
        }
        // One payment link per period.
        const { data: existing } = await db.from('nomad_charges').select('id').eq('membership_id', m.id).eq('kind', 'dues').eq('period_start', m.paid_through).in('status', ['link_sent', 'paid_link']).limit(1)
        if (!existing?.length) {
          const link = await paymentLink(res.cents, 'Made Kulture Nomad membership')
          if (link) {
            await db.from('nomad_charges').insert({ membership_id: m.id, kind: 'dues', amount_cents: res.cents, period_start: m.paid_through, period_end: res.periodEnd, status: 'link_sent', square_order_id: link.orderId, payment_link_id: link.linkId, payment_link_url: link.url })
            out.links++
            if (m.email) await sendSimpleEmail({
              to: m.email, label: 'nomad_dues_link', subject: 'Action needed: your Nomad membership', heading: 'Your renewal didn’t go through',
              paragraphs: [`We couldn’t charge your card for this month’s Nomad membership ($${(res.cents / 100).toFixed(2)}). Here’s a secure link to pay. You can also update your card in your account.`],
              ctaText: 'Pay now', ctaUrl: link.url,
            }).catch(() => {})
            if (m.auth_user_id) await sendMemberPush(m.auth_user_id, { title: 'Nomad: renewal declined', body: 'Your card was declined. Check your email for a payment link.', url: '/account/nomad' }).catch(() => 0)
            await sendOwnerPush({ title: 'Nomad: dues declined', body: `${who} · $${(res.cents / 100).toFixed(0)} · payment link sent`, url: '/admin/nomad' }).catch(() => {})
          } else {
            out.errors.push(`link failed for ${m.id}`)
            await sendOwnerPush({ title: '⚠️ Nomad: dues declined and no payment link', body: `${who}. Charge it by hand.`, url: '/admin/nomad' }).catch(() => {})
          }
        }
        // Past the grace days → pause.
        const since = m.past_due_since ? Date.parse(m.past_due_since) : now
        if ((now - since) / 86_400_000 >= s.past_due_grace_days) {
          const { data: paused } = await db.from('nomad_memberships').update({ status: 'paused' }).eq('id', m.id).eq('status', 'past_due').select('*')
          if (paused?.length) {
            out.paused++
            await syncPlus(db, paused[0]).catch(e => out.errors.push(`plus ${m.id}: ${e.message}`))
            await sendOwnerPush({ title: 'Nomad: membership paused', body: `${who} — unpaid for ${s.past_due_grace_days} days.`, url: '/admin/nomad' }).catch(() => {})
          }
        }
        continue
      }

      // 3. Plus follows the membership.
      const r = await syncPlus(db, m)
      if (r === 'Plus on' || r === 'Plus off') out.plusSynced++
    } catch (e: any) {
      out.errors.push(`${m.id}: ${e?.message || e}`)
    }
  }

  // 4. Join requests nobody answered before check-in → declined, nights back.
  const { data: stale } = await db.from('nomad_stays').select('id, membership_id, nights_cost').eq('status', 'requested').lte('check_in', today)
  for (const st of stale ?? []) {
    const { data: claimed } = await db.from('nomad_stays').update({ status: 'declined', cancelled_at: new Date().toISOString() }).eq('id', st.id).eq('status', 'requested').select('id')
    if (!claimed?.length) continue
    out.requestsExpired++
    if (st.nights_cost > 0) await db.from('nomad_nights').insert({ membership_id: st.membership_id, delta: st.nights_cost, reason: 'stay_refund', stay_id: st.id, note: 'request expired' })
  }

  // 5. Pre-arrival email, 2 days out. The door code stays in the account page.
  const { data: soon } = await db.from('nomad_stays').select('id, check_in, check_out, nomad_memberships ( email, name, auth_user_id )')
    .eq('status', 'confirmed').is('reminded_at', null).gte('check_in', today).lte('check_in', addDays(today, 2))
  for (const st of soon ?? []) {
    const mm: any = (st as any).nomad_memberships
    const { data: claimed } = await db.from('nomad_stays').update({ reminded_at: new Date().toISOString() }).eq('id', st.id).is('reminded_at', null).select('id')
    if (!claimed?.length) continue
    out.reminders++
    if (mm?.email) await sendSimpleEmail({
      to: mm.email, label: 'nomad_pre_arrival', subject: `Your Nomad stay starts ${st.check_in}`, heading: `See you soon, ${firstName(mm.name)}`,
      paragraphs: [
        `Your stay at the house runs ${st.check_in} to ${st.check_out}. Check-in from ${s.check_in_hour}:00, check-out by ${s.check_out_hour}:00 (Mexico City time).`,
        'The address, your door code and the house rules are in your account. Register any models or collaborators by the day before.',
      ],
      ctaText: 'Open Nomad', ctaUrl: `${APP_URL}/account/nomad`,
    }).catch(() => {})
  }

  // 6. Door codes, minted only inside 3 days of check-in and only for an
  //    ACTIVE member — an algoPIN can't be revoked, so nothing earlier.
  if (s.door_codes_enabled) {
    const { data: due } = await db.from('nomad_stays').select('*, nomad_memberships ( name, status )')
      .eq('status', 'confirmed').is('door_code', null).gte('check_out', today).lte('check_in', addDays(today, 3))
    for (const st of due ?? []) {
      const mm: any = (st as any).nomad_memberships
      if (mm?.status !== 'active') continue
      const code = await issueStayDoorCode(db, st, s, firstName(mm?.name))
      if (code) out.doorCodes++
    }
  }

  if (out.errors.length) console.error('[cron/nomad] errors', out.errors)
  return NextResponse.json({ ok: true, ...out })
}
