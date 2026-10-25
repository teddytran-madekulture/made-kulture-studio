// /api/admin/nomad/members — Nomad operations for the admin (2026-10-25).
//   GET  → members (+ night balance, last charge), stays, the house week,
//          recent charges, settings.
//   POST → { action, ... } — invite | set_status | update_member | adjust_nights |
//          retry_charge | mark_paid | cancel_stay | mint_code | settings
// Linked from BOTH admin sidebars via /admin/nomad.
import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { findAuthUserIdByEmail } from '@/lib/auth-user'
import { sendSimpleEmail } from '@/lib/email'
import {
  getNomadSettings, saveNomadSettings, nightBalance, chargeDuesPeriod, applyPaidDues, syncPlus,
  issueStayDoorCode, mxToday, addDays, firstName, ACTIVE_STAY, square,
} from '@/lib/nomad'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')
const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return bad('Unauthorized', 401)
  const db = supabaseAdmin()
  try {
    const s = await getNomadSettings(db)
    const today = mxToday()
    const week = addDays(today, 7)
    const [{ data: members, error: mErr }, { data: stays, error: sErr }, { data: charges, error: cErr }, { data: nights, error: nErr }] = await Promise.all([
      db.from('nomad_memberships').select('*').order('created_at', { ascending: false }),
      db.from('nomad_stays').select('*, nomad_memberships ( name, email )').gte('check_out', addDays(today, -14)).order('check_in'),
      db.from('nomad_charges').select('*, nomad_memberships ( name, email )').order('created_at', { ascending: false }).limit(60),
      db.from('nomad_nights').select('membership_id, delta'),
    ])
    // A failed read must never render as "nobody".
    const err = mErr || sErr || cErr || nErr
    if (err) return bad(err.message, 500)

    const bal = new Map<string, number>()
    for (const n of nights ?? []) bal.set(n.membership_id, (bal.get(n.membership_id) ?? 0) + Number(n.delta || 0))
    const lastCharge = new Map<string, any>()
    for (const c of charges ?? []) if (!lastCharge.has(c.membership_id)) lastCharge.set(c.membership_id, c)

    const [{ data: visitors }, { data: blocks }] = await Promise.all([
      db.from('nomad_visitors').select('*, nomad_memberships ( name )').eq('status', 'registered').gte('day', today).lte('day', week).order('day'),
      db.from('nomad_studio_blocks').select('*, nomad_memberships ( name )').eq('status', 'booked').gte('day', today).lte('day', week).order('day'),
    ])

    return NextResponse.json({
      today, settings: s,
      doorReady: !!process.env.NOMAD_IGLOOHOME_DEVICE_ID,
      members: (members ?? []).map(m => ({ ...m, balance: bal.get(m.id) ?? 0, last_charge: lastCharge.get(m.id) ?? null })),
      stays: (stays ?? []).map((x: any) => ({ ...x, who: x.nomad_memberships?.name || x.nomad_memberships?.email })),
      charges: (charges ?? []).map((c: any) => ({ ...c, who: c.nomad_memberships?.name || c.nomad_memberships?.email })),
      house: {
        arrivals: (stays ?? []).filter(x => x.status === 'confirmed' && x.check_in >= today && x.check_in <= week),
        departures: (stays ?? []).filter(x => x.status === 'confirmed' && x.check_out >= today && x.check_out <= week),
        inHouse: (stays ?? []).filter(x => x.status === 'confirmed' && x.check_in <= today && x.check_out > today),
        visitors: (visitors ?? []).map((v: any) => ({ ...v, host: firstName(v.nomad_memberships?.name) })),
        blocks: (blocks ?? []).map((b: any) => ({ ...b, who: firstName(b.nomad_memberships?.name) })),
      },
    })
  } catch (e: any) {
    console.error('[admin/nomad/members] GET failed', e)
    return bad(e?.message || 'Could not load.', 500)
  }
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return bad('Unauthorized', 401)
  const body = await req.json().catch(() => ({} as any))
  const action = String(body.action || '')
  const db = supabaseAdmin()
  try {
    const s = await getNomadSettings(db)
    const member = async () => {
      const { data } = await db.from('nomad_memberships').select('*').eq('id', String(body.id || '')).maybeSingle()
      return data
    }

    if (action === 'settings') {
      const next = await saveNomadSettings(db, body.settings || {})
      return NextResponse.json({ ok: true, settings: next })
    }

    if (action === 'invite') {
      const { data: app } = await db.from('nomad_interest').select('*').eq('id', String(body.applicationId || '')).maybeSingle()
      if (!app) return bad('Application not found.', 404)
      if (app.status !== 'approved') return bad('Approve the application first.')
      const userId = await findAuthUserIdByEmail(db, app.email)
      if (!userId) return bad('They don’t have a member login yet. The approval email has a sign-up link; invite them once they’ve signed up.', 409)
      const { data: existing } = await db.from('nomad_memberships').select('*').eq('auth_user_id', userId).maybeSingle()
      if (existing && !['ended'].includes(existing.status)) return bad(`They already have a membership (${existing.status}).`, 409)
      const row = {
        auth_user_id: userId, email: String(app.email).toLowerCase(), name: app.name, application_id: app.id,
        status: 'pending', founding: body.founding === true,
        dues_cents: Number(body.duesCents) > 0 ? Math.round(Number(body.duesCents)) : null,
      }
      const { data: saved, error } = existing
        ? await db.from('nomad_memberships').update(row).eq('id', existing.id).select('id')
        : await db.from('nomad_memberships').insert(row).select('id')
      if (error || !saved?.length) return bad(`Not saved: ${error?.message || 'no row'}`, 500)
      const dues = (row.dues_cents || s.dues_cents) / 100
      const sent = await sendSimpleEmail({
        to: row.email, label: 'nomad_membership_ready', subject: 'Your Nomad membership is ready',
        heading: `${firstName(app.name)}, your spot is ready`,
        paragraphs: [
          `Your Nomad membership is set up and waiting for you to start it: <strong style="color:#fff;">$${dues.toFixed(0)} a month</strong>, with ${s.nights_per_month} nights a month in your night bank (up to ${s.night_cap}) and Made Kulture Plus included while you’re a member.`,
          'Open Nomad in your account, read the house rules, pick a card and start. Nothing is charged until you press start.',
        ],
        ctaText: 'Start my membership', ctaUrl: `${APP_URL}/account/nomad`,
      }).catch((e: any) => { console.error('[admin/nomad] invite email failed', e); return null })
      return NextResponse.json({ ok: true, emailed: !!sent })
    }

    if (action === 'set_status') {
      const m = await member(); if (!m) return bad('Member not found.', 404)
      const status = String(body.status || '')
      if (!['active', 'paused', 'ended', 'pending'].includes(status)) return bad('Bad status.')
      if (status === 'pending' && !['starting', 'ended'].includes(m.status)) return bad('Only a stuck or ended membership can go back to pending.')
      if (status === 'active' && !(m.paid_through && Date.parse(m.paid_through) > Date.now())) return bad('Their paid month is over. Use RETRY CHARGE or MARK PAID instead.')
      const patch: any = { status }
      if (status === 'ended') { patch.ended_at = new Date().toISOString() }
      if (status === 'active') { patch.past_due_since = null }
      const { data, error } = await db.from('nomad_memberships').update(patch).eq('id', m.id).select('*')
      if (error || !data?.length) return bad(error?.message || 'Not saved.', 500)
      const plus = await syncPlus(db, data[0])
      if (status === 'ended') {
        // Same as the cron: future stays end with the membership.
        await db.from('nomad_stays').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('membership_id', m.id).in('status', ACTIVE_STAY).gt('check_in', mxToday())
      }
      return NextResponse.json({ ok: true, plus })
    }

    if (action === 'update_member') {
      const m = await member(); if (!m) return bad('Member not found.', 404)
      const patch: any = {}
      if (body.founding !== undefined) patch.founding = body.founding === true
      if (body.duesCents !== undefined) patch.dues_cents = Number(body.duesCents) > 0 ? Math.round(Number(body.duesCents)) : null
      if (typeof body.adminNotes === 'string') patch.admin_notes = body.adminNotes.slice(0, 4000)
      const { data, error } = await db.from('nomad_memberships').update(patch).eq('id', m.id).select('id')
      if (error || !data?.length) return bad(error?.message || 'Not saved.', 500)
      return NextResponse.json({ ok: true })
    }

    if (action === 'adjust_nights') {
      const m = await member(); if (!m) return bad('Member not found.', 404)
      const delta = Math.round(Number(body.delta))
      if (!delta || Math.abs(delta) > 60) return bad('Enter a number of nights between -60 and 60.')
      const { error } = await db.from('nomad_nights').insert({ membership_id: m.id, delta, reason: 'admin', note: String(body.note || '').slice(0, 200) || null })
      if (error) return bad(error.message, 500)
      return NextResponse.json({ ok: true, balance: await nightBalance(db, m.id) })
    }

    if (action === 'retry_charge') {
      const m = await member(); if (!m) return bad('Member not found.', 404)
      if (!m.paid_through || Date.parse(m.paid_through) > Date.now()) return bad('Nothing is due yet.')
      if (!['active', 'past_due', 'paused'].includes(m.status)) return bad(`Can’t charge a ${m.status} membership.`)
      const res = await chargeDuesPeriod(db, m, s, m.paid_through, mxToday().replace(/-/g, ''))
      if (!res.ok) return bad(`Declined: ${res.error}`, 402)
      return NextResponse.json({ ok: true })
    }

    if (action === 'mark_paid') {
      // Cash / Zelle against an open payment link.
      const { data: claimed, error } = await db.from('nomad_charges').update({ status: 'paid_link', error: 'marked paid by admin' })
        .eq('id', String(body.chargeId || '')).in('status', ['link_sent', 'failed']).select('*')
      if (error) return bad(error.message, 500)
      if (!claimed?.length) return bad('That charge isn’t open.', 409)
      // Kill the Square link so it can't ALSO be paid online.
      if (claimed[0].payment_link_id) {
        try { await square().checkoutApi.deletePaymentLink(claimed[0].payment_link_id) } catch (e: any) { console.error('[admin/nomad] delete link failed', e?.errors ?? e) }
      }
      if (claimed[0].kind === 'dues') await applyPaidDues(db, claimed[0], s)
      return NextResponse.json({ ok: true })
    }

    if (action === 'cancel_stay') {
      const { data: stay } = await db.from('nomad_stays').select('*').eq('id', String(body.stayId || '')).in('status', ACTIVE_STAY).maybeSingle()
      if (!stay) return bad('Stay not found.', 404)
      const { data: claimed } = await db.from('nomad_stays').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', stay.id).in('status', ACTIVE_STAY).select('id')
      if (!claimed?.length) return bad('Already cancelled.', 409)
      const back = body.refund === true ? stay.nights_cost + (stay.status === 'confirmed' ? stay.extra_nights : 0) : 0
      if (back > 0) await db.from('nomad_nights').insert({ membership_id: stay.membership_id, delta: back, reason: 'stay_refund', stay_id: stay.id, note: 'cancelled by studio' })
      await db.from('nomad_studio_blocks').update({ status: 'cancelled' }).eq('stay_id', stay.id)
      await db.from('nomad_visitors').update({ status: 'cancelled' }).eq('stay_id', stay.id)
      return NextResponse.json({ ok: true, nightsBack: back })
    }

    if (action === 'mint_code') {
      const { data: stay } = await db.from('nomad_stays').select('*, nomad_memberships ( name )').eq('id', String(body.stayId || '')).eq('status', 'confirmed').maybeSingle()
      if (!stay) return bad('Confirmed stay not found.', 404)
      if (!s.door_codes_enabled) return bad('Turn on door codes in Settings first.')
      if (!process.env.NOMAD_IGLOOHOME_DEVICE_ID) return bad('NOMAD_IGLOOHOME_DEVICE_ID isn’t set in Vercel yet.')
      const code = await issueStayDoorCode(db, stay, s, firstName((stay as any).nomad_memberships?.name), true)
      if (!code) return bad('igloohome didn’t return a code. Check the Vercel logs for [nomad].', 502)
      return NextResponse.json({ ok: true })
    }

    return bad('Unknown action')
  } catch (e: any) {
    console.error('[admin/nomad/members] POST failed', action, e)
    return bad(e?.message || 'Something went wrong.', 500)
  }
}
