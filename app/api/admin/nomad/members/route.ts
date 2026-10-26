// /api/admin/nomad/members — Nomad operations for the admin (2026-10-25).
//   GET  → members (+ night balance, last charge), stays, the house week,
//          recent charges, settings.
//   POST → { action, ... } — invite | set_status | update_member | adjust_nights |
//          retry_charge | mark_paid | cancel_stay | mint_code | settings | house_save |
//          set_flights | flight_options | flight_booked | flight_cancel | flight_adjust | transfer_mark
// Linked from BOTH admin sidebars via /admin/nomad.
import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { findAuthUserIdByEmail } from '@/lib/auth-user'
import { sendSimpleEmail } from '@/lib/email'
import { sendMemberPush } from '@/lib/member-push'
import {
  getNomadSettings, readRawSettings, isSimple, nightsToReturn, flightBalance, flightPlan, settleOnEnd, nomadCreditUsage, chargeMember, saveNomadSettings, nightBalance, chargeDuesPeriod, applyPaidDues, syncPlus,
  issueStayDoorCode, mxToday, addDays, firstName, ACTIVE_STAY, square,
  getHouses, getHouse, houseSettings, localToday, earliestToday, cleanHouse, cancelFutureStays, releaseWaitingOn, HOUSE_OVERRIDE_KEYS, TIMEZONES,
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
    const allHouses = await getHouses(db)
    const today = earliestToday(allHouses)
    const week = addDays(today, 8)
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

    // Flights + the Nomad → studio money log.
    const [{ data: fcRows, error: fcErr }, { data: freqs, error: frErr }, { data: transfers, error: tErr }] = await Promise.all([
      db.from('nomad_flight_credit').select('membership_id, delta_cents'),
      db.from('nomad_flight_requests').select('*, nomad_memberships ( name, email ), nomad_stays ( check_in, check_out, house_id )')
        .or(`status.in.(requested,options_sent,chosen),created_at.gte.${new Date(Date.now() - 45 * 86_400_000).toISOString()}`).order('created_at', { ascending: false }),
      db.from('nomad_studio_transfers').select('*').order('created_at', { ascending: false }).limit(100),
    ])
    const fErr = fcErr || frErr || tErr
    if (fErr) return bad(`${fErr.message} (has migration 176 run?)`, 500)
    const fbal = new Map<string, number>()
    for (const r of fcRows ?? []) fbal.set(r.membership_id, (fbal.get(r.membership_id) ?? 0) + Number(r.delta_cents || 0))
    const usage = await nomadCreditUsage(db)
    const sent = new Map<string, number>()
    for (const t of transfers ?? []) sent.set(t.month, (sent.get(t.month) ?? 0) + Number(t.amount_cents || 0))
    const moneyLog = {
      issued_cents: usage.issued_cents, used_cents: usage.used_cents, unspent_cents: usage.unspent_cents,
      transferred_cents: (transfers ?? []).reduce((n, t: any) => n + Number(t.amount_cents || 0), 0),
      months: usage.months.map(x => ({ ...x, transferred_cents: sent.get(x.month) ?? 0, owed_cents: Math.max(0, x.used_cents - (sent.get(x.month) ?? 0)) })),
      transfers: transfers ?? [],
    }

    // Check-outs (2026-10-26): checklist + photos, signed URLs only (private bucket).
    const stayIds = (stays ?? []).map((x: any) => x.id)
    const { data: cos } = stayIds.length ? await db.from('nomad_checkouts').select('*').in('stay_id', stayIds) : { data: [] as any[] }
    const checkoutByStay = new Map<string, any>()
    for (const c of cos ?? []) {
      const { data: signed } = c.photos?.length ? await db.storage.from('nomad-checkout').createSignedUrls(c.photos, 600) : { data: [] as any[] }
      checkoutByStay.set(c.stay_id, { at: c.created_at, notes: c.notes, photos: (signed ?? []).map((x: any) => x.signedUrl).filter(Boolean) })
    }

    const [{ data: visitors }, { data: blocks }] = await Promise.all([
      db.from('nomad_visitors').select('*, nomad_memberships ( name )').eq('status', 'registered').gte('day', today).lte('day', week).order('day'),
      db.from('nomad_studio_blocks').select('*, nomad_memberships ( name )').eq('status', 'booked').gte('day', today).lte('day', week).order('day'),
    ])

    const houseName = new Map(allHouses.map(h => [h.id, h.name]))
    // The 7-day view, per house, on each house's own calendar.
    const houses = allHouses.map(h => {
      const hs = houseSettings(s, h)
      const t = localToday(h.timezone), w = addDays(t, 7)
      const mine = (stays ?? []).filter((x: any) => x.house_id === h.id && x.status === 'confirmed')
      return {
        ...h, today: t, doorReady: !!hs.lock_device_id, doorCodesOn: hs.door_codes_enabled,
        effective: Object.fromEntries(HOUSE_OVERRIDE_KEYS.map(k => [k, (hs as any)[k]])),
        week: {
          arrivals: mine.filter((x: any) => x.check_in >= t && x.check_in <= w),
          departures: mine.filter((x: any) => x.check_out >= t && x.check_out <= w),
          inHouse: mine.filter((x: any) => x.check_in <= t && x.check_out > t),
          visitors: (visitors ?? []).filter((v: any) => v.house_id === h.id && v.day >= t && v.day <= w).map((v: any) => ({ ...v, host: firstName(v.nomad_memberships?.name) })),
          blocks: (blocks ?? []).filter((b: any) => b.house_id === h.id && b.day >= t && b.day <= w).map((b: any) => ({ ...b, who: firstName(b.nomad_memberships?.name) })),
        },
      }
    })
    return NextResponse.json({
      today, settings: s, rawSettings: await readRawSettings(db), houses, timezones: TIMEZONES, overrideKeys: HOUSE_OVERRIDE_KEYS,
      members: (members ?? []).map(m => {
        const fb = fbal.get(m.id) ?? 0
        return { ...m, balance: bal.get(m.id) ?? 0, last_charge: lastCharge.get(m.id) ?? null, flight_balance: fb, flight_paused: flightPlan(m, s, fb).paused }
      }),
      flightRequests: (freqs ?? []).map((r: any) => ({ ...r, who: r.nomad_memberships?.name || r.nomad_memberships?.email, email: r.nomad_memberships?.email, flight_balance: fbal.get(r.membership_id) ?? 0, stay: r.nomad_stays || null })),
      moneyLog,
      stays: (stays ?? []).map((x: any) => ({ ...x, who: x.nomad_memberships?.name || x.nomad_memberships?.email, house: houseName.get(x.house_id) || '?', checkout: checkoutByStay.get(x.id) || null })),
      charges: (charges ?? []).map((c: any) => ({ ...c, who: c.nomad_memberships?.name || c.nomad_memberships?.email })),
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

    if (action === 'house_save') {
      const { patch, error: cleanErr } = cleanHouse(body.house || {})
      if (cleanErr) return bad(cleanErr)
      const id = String(body.house?.id || '')
      if (!id) {
        for (const k of ['name', 'city', 'timezone', 'slug']) if (!patch[k]) return bad('A new house needs a name, city, time zone and short code.')
        patch.active = false   // new houses start closed; open them when they're ready
        const { data, error } = await db.from('nomad_houses').insert(patch).select('id')
        if (error) return bad(error.code === '23505' ? 'That short code is taken.' : error.message, 500)
        if (!data?.length) return bad('Not saved.', 500)
        return NextResponse.json({ ok: true, id: data[0].id })
      }
      if (patch.slug) delete patch.slug   // the code is permanent once made (the first house's lock fallback keys on it)
      if (patch.active === false) {
        const { count } = await db.from('nomad_houses').select('id', { count: 'exact', head: true }).eq('active', true).neq('id', id)
        if (!count) return bad('At least one house has to stay open.')
      }
      const { data, error } = await db.from('nomad_houses').update(patch).eq('id', id).select('id')
      if (error || !data?.length) return bad(error?.message || 'House not found.', 500)
      return NextResponse.json({ ok: true })
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
          `Your Nomad membership is set up and waiting for you to start it: <strong style="color:#fff;">$${dues.toFixed(0)} a month</strong>, with ${isSimple(s) ? `one trip a month of up to ${s.nights_per_month} nights in a row, with the house to yourself` : `${s.nights_per_month} nights a month in your night bank (up to ${s.night_cap})`} and Made Kulture Plus included while you’re a member.`,
          `Sign in with <strong style="color:#fff;">${row.email}</strong> (the account you already have), open Nomad, read the house rules, pick a card and start. Nothing is charged until you press start.`,
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
      let settled: any = null
      if (status === 'ended') {
        // Same as the cron: future stays (at every house) end with the membership,
        // then the unused month + leftover flight credit become studio credit.
        await cancelFutureStays(db, m.id)
        settled = await settleOnEnd(db, data[0], s).catch(e => { console.error('[admin/nomad] settle failed', e); return null })
      }
      return NextResponse.json({ ok: true, plus, settled })
    }

    // ── Flights ──────────────────────────────────────────────────────────
    if (action === 'set_flights') {
      const m = await member(); if (!m) return bad('Member not found.', 404)
      const { data, error } = await db.from('nomad_memberships').update({ flights_enabled: body.on === true, flights_next: null }).eq('id', m.id).select('id')
      if (error || !data?.length) return bad(error?.message || 'Not saved.', 500)
      return NextResponse.json({ ok: true })
    }

    if (action === 'flight_adjust') {
      const m = await member(); if (!m) return bad('Member not found.', 404)
      const delta = Math.round(Number(body.deltaCents))
      if (!delta || Math.abs(delta) > 100000) return bad('Enter an amount.')
      const { error } = await db.from('nomad_flight_credit').insert({ membership_id: m.id, delta_cents: delta, reason: 'admin', note: String(body.note || '').slice(0, 200) || null })
      if (error) return bad(error.message, 500)
      return NextResponse.json({ ok: true, balance: await flightBalance(db, m.id) })
    }

    const flightRequest = async () => {
      const { data } = await db.from('nomad_flight_requests').select('*, nomad_memberships ( * )').eq('id', String(body.requestId || '')).maybeSingle()
      return data
    }

    if (action === 'flight_options') {
      const rq = await flightRequest(); if (!rq) return bad('Request not found.', 404)
      if (!['requested', 'options_sent', 'chosen'].includes(rq.status)) return bad(`That request is ${rq.status}.`)
      const options = (Array.isArray(body.options) ? body.options : [])
        .map((o: any) => ({ label: String(o?.label || '').trim().slice(0, 300), price_cents: Math.round(Number(o?.price_cents)) }))
        .filter((o: any) => o.label && o.price_cents > 0).slice(0, 4)
      if (!options.length) return bad('Add at least one option with a price.')
      const { data, error } = await db.from('nomad_flight_requests').update({ options, status: 'options_sent', chosen_index: null, chosen_at: null, options_sent_at: new Date().toISOString(), admin_note: String(body.note || '').slice(0, 500) || null })
        .eq('id', rq.id).in('status', ['requested', 'options_sent', 'chosen']).select('id')
      if (error || !data?.length) return bad(error?.message || 'Not saved.', 500)
      const mm = rq.nomad_memberships
      if (mm?.auth_user_id) await sendMemberPush(mm.auth_user_id, { title: 'Nomad: your flight options are ready', body: `${options.length} option${options.length === 1 ? '' : 's'} to pick from.`, url: '/account/nomad' }).catch(() => 0)
      if (mm?.email) await sendSimpleEmail({
        to: mm.email, label: 'nomad_flight_options', subject: 'Your Nomad flight options', heading: 'Pick your flights',
        paragraphs: [`We found ${options.length} option${options.length === 1 ? '' : 's'} for your trip. Open Nomad and tap the one you want. Nothing is booked until you choose.`],
        ctaText: 'Choose my flights', ctaUrl: `${APP_URL}/account/nomad`,
      }).catch(() => {})
      return NextResponse.json({ ok: true })
    }

    if (action === 'flight_booked') {
      const rq = await flightRequest(); if (!rq) return bad('Request not found.', 404)
      const cost = Math.round(Number(body.costCents))
      const confirmation = String(body.confirmation || '').trim().slice(0, 120)
      if (!(cost > 0)) return bad('Enter what the flights cost.')
      if (!confirmation) return bad('Enter the confirmation number.')
      // CLAIM before any money moves, so a double tap can't deduct twice.
      const { data: claimed, error: cErr } = await db.from('nomad_flight_requests')
        .update({ status: 'booked', booked_at: new Date().toISOString(), cost_cents: cost, confirmation })
        .eq('id', rq.id).in('status', ['requested', 'options_sent', 'chosen']).select('id')
      if (cErr || !claimed?.length) return bad(cErr?.message || 'Already booked or cancelled.', 409)
      const mm = rq.nomad_memberships
      const balNow = await flightBalance(db, rq.membership_id)
      const use = Math.min(Math.max(balNow, 0), cost)
      const diff = cost - use
      if (use > 0) {
        const { error } = await db.from('nomad_flight_credit').insert({ membership_id: rq.membership_id, delta_cents: -use, reason: 'flight', request_id: rq.id, note: confirmation })
        if (error) console.error('[admin/nomad] CRITICAL: flight booked but credit not deducted', rq.id, error)
      }
      let charged = 0, chargeError: string | null = null
      if (diff > 0) {
        const pay = await chargeMember(db, mm, diff, `Nomad flights (difference over credit) ${confirmation}`, `fl${String(rq.id).replace(/-/g, '').slice(0, 16)}`)
        await db.from('nomad_charges').insert({ membership_id: rq.membership_id, kind: 'flight_difference', amount_cents: diff, status: pay.ok ? 'charged' : 'failed', square_payment_id: pay.paymentId ?? null, error: pay.ok ? null : pay.error })
        if (pay.ok) charged = diff; else chargeError = pay.error || 'declined'
      }
      await db.from('nomad_flight_requests').update({ credit_used_cents: use, charged_cents: charged }).eq('id', rq.id)
      if (mm?.auth_user_id) await sendMemberPush(mm.auth_user_id, { title: 'Nomad: your flights are booked', body: `Confirmation ${confirmation}. The airline will email you too.`, url: '/account/nomad' }).catch(() => 0)
      if (mm?.email) await sendSimpleEmail({
        to: mm.email, label: 'nomad_flight_booked', subject: 'Your Nomad flights are booked', heading: 'You’re booked',
        paragraphs: [
          `Your flights are booked. Confirmation: <strong style="color:#fff;">${confirmation}</strong>. The airline will email you the itinerary and check-in reminders.`,
          `Total $${(cost / 100).toFixed(2)}: $${(use / 100).toFixed(2)} from your flight credit${diff > 0 ? (charged ? `, $${(diff / 100).toFixed(2)} charged to your Nomad card` : `, and $${(diff / 100).toFixed(2)} still to settle (we’ll be in touch)`) : ''}.`,
          'Add your passport details at online check-in. Changes follow the airline’s rules; any fare difference comes from your flight credit first.',
        ],
        ctaText: 'Open Nomad', ctaUrl: `${APP_URL}/account/nomad`,
      }).catch(() => {})
      return NextResponse.json({ ok: true, creditUsed: use, charged, chargeError, owed: diff - charged })
    }

    if (action === 'flight_cancel') {
      const rq = await flightRequest(); if (!rq) return bad('Request not found.', 404)
      if (rq.status === 'cancelled') return bad('Already cancelled.', 409)
      const refund = Math.max(0, Math.round(Number(body.refundCents) || 0))
      const { data, error } = await db.from('nomad_flight_requests').update({ status: 'cancelled', cancelled_at: new Date().toISOString(), admin_note: String(body.note || rq.admin_note || '').slice(0, 500) || null })
        .eq('id', rq.id).neq('status', 'cancelled').select('id')
      if (error || !data?.length) return bad(error?.message || 'Not saved.', 500)
      if (refund > 0) await db.from('nomad_flight_credit').insert({ membership_id: rq.membership_id, delta_cents: refund, reason: 'flight_refund', request_id: rq.id, note: 'airline refund back to credit' })
      return NextResponse.json({ ok: true })
    }

    if (action === 'transfer_mark') {
      const month = String(body.month || '')
      const amount = Math.round(Number(body.amountCents))
      if (!/^\d{4}-\d{2}$/.test(month)) return bad('Pick a month.')
      if (!(amount > 0)) return bad('Enter the amount you moved.')
      const { error } = await db.from('nomad_studio_transfers').insert({ month, amount_cents: amount, note: String(body.note || '').slice(0, 200) || null })
      if (error) return bad(error.message, 500)
      return NextResponse.json({ ok: true })
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
      // Not 'confirming' (an approval is mid-charge): wait a moment and retry.
      const { data: stay } = await db.from('nomad_stays').select('*').eq('id', String(body.stayId || '')).in('status', ['confirmed', 'requested']).maybeSingle()
      if (!stay) return bad('Stay not found (or it’s being confirmed right now; try again in a minute).', 404)
      const { data: claimed } = await db.from('nomad_stays').update({ status: 'cancelled', cancelled_at: new Date().toISOString() }).eq('id', stay.id).in('status', ['confirmed', 'requested']).select('id')
      if (!claimed?.length) return bad('Already cancelled.', 409)
      const back = body.refund === true ? await nightsToReturn(db, stay.membership_id, stay.nights_cost + (stay.status === 'confirmed' ? stay.extra_nights : 0), s) : 0
      if (back > 0) await db.from('nomad_nights').insert({ membership_id: stay.membership_id, delta: back, reason: 'stay_refund', stay_id: stay.id, note: 'cancelled by studio' })
      await db.from('nomad_studio_blocks').update({ status: 'cancelled' }).eq('stay_id', stay.id)
      await db.from('nomad_visitors').update({ status: 'cancelled' }).eq('stay_id', stay.id)
      await releaseWaitingOn(db, stay.id).catch(e => console.error('[admin/nomad] release waiting failed', e))
      return NextResponse.json({ ok: true, nightsBack: back })
    }

    if (action === 'mint_code') {
      const { data: stay } = await db.from('nomad_stays').select('*, nomad_memberships ( name )').eq('id', String(body.stayId || '')).eq('status', 'confirmed').maybeSingle()
      if (!stay) return bad('Confirmed stay not found.', 404)
      const house = await getHouse(db, stay.house_id)
      if (!house) return bad('That stay’s house is missing.', 500)
      const hs = houseSettings(s, house)
      if (!hs.door_codes_enabled) return bad(`Turn on door codes for ${house.name} first (Houses tab).`)
      if (!hs.lock_device_id) return bad(`${house.name} has no lock yet. Add its igloohome device ID in the Houses tab.`)
      const code = await issueStayDoorCode(db, stay, hs, firstName((stay as any).nomad_memberships?.name), true)
      if (!code) return bad('igloohome didn’t return a code. Check the Vercel logs for [nomad].', 502)
      return NextResponse.json({ ok: true })
    }

    return bad('Unknown action')
  } catch (e: any) {
    console.error('[admin/nomad/members] POST failed', action, e)
    return bad(e?.message || 'Something went wrong.', 500)
  }
}
