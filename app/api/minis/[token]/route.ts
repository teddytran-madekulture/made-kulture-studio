// GET  /api/minis/[token] — a photographer's public Mini Sessions sign-up page.
// POST /api/minis/[token] — a client takes a slot.
//
// ⚠️ PUBLIC, no account. The share token is the only key, and it only ever
// reaches ONE mini-session day. Taken slots show as taken — never who took them.
// ⚠️ The headcount cap is enforced HERE, server-side, on every sign-up.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { bookingForMini, guestSettings, photographerName, ctxFor, sendClientConfirmation, STUDIO_ADDRESS } from '@/lib/mini-sessions-server'
import { cleanText, cleanEmail, cleanPhone, partyRoom, slotsFor, signupsClosed, slotLabel, fmtDay, payHost, type MiniSession, type MiniClient } from '@/lib/mini-sessions'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
const TOKEN_RE = /^[0-9a-f]{32}$/i

async function load(token: string) {
  if (!TOKEN_RE.test(token)) return null
  const db = supabaseAdmin()
  const { data: m, error } = await db.from('mini_sessions').select('*').eq('share_token', token).maybeSingle()
  if (error) throw new Error(error.message)
  if (!m) return null
  // A planned day (migration 161) runs on a stand-in built from its plan.
  const b = await bookingForMini(db, m as MiniSession)
  if (!b) return null
  const { data: cs, error: cErr } = await db.from('mini_session_clients').select('slot_index, pending_slot, email, status').eq('mini_session_id', m.id).eq('status', 'booked')
  if (cErr) throw new Error(cErr.message)
  return { db, mini: m as MiniSession, booking: b as any, taken: (cs ?? []) as Pick<MiniClient, 'slot_index' | 'pending_slot' | 'email' | 'status'>[] }
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  let r
  try { r = await load(params.token) } catch { return NextResponse.json({ error: 'We couldn’t load this page just now — please try again.' }, { status: 503 }) }
  if (!r) return NextResponse.json({ error: 'This sign-up link isn’t valid. Check with your photographer.' }, { status: 404 })
  const { db, mini, booking: b, taken } = r
  const room = partyRoom(b, mini, await guestSettings(db))
  const takenSet = new Set(taken.flatMap(t => t.pending_slot != null ? [t.slot_index, t.pending_slot] : [t.slot_index]))
  const blocked = new Set(mini.blocked_slots ?? [])
  const state =
    mini.status === 'cancelled' || b.status === 'cancelled' ? 'cancelled'
    : b.status !== 'confirmed' && b.status !== 'planned' ? 'closed'
    : Date.parse(b.end_time) < Date.now() ? 'over'
    : mini.status === 'closed' || signupsClosed(b, mini) ? 'closed'
    : 'open'
  return NextResponse.json({
    state,
    // Planned = the photographer hasn't booked the studio yet; sign-ups are requests.
    pending: !!b.planned,
    title: mini.title,
    note: mini.note,
    priceText: mini.price_text,
    coverUrl: mini.cover_url,
    // The photographer's own pay link — shown once a slot is booked. Hidden while
    // the day is only planned: nobody should pay for a day that isn't confirmed.
    payUrl: b.planned ? null : mini.payment_url,
    payHost: b.planned ? null : payHost(mini.payment_url),
    photographer: await photographerName(db, b, mini.owner_user_id),
    day: fmtDay(b.start_time),
    address: STUDIO_ADDRESS,
    maxParty: room.max,
    includedParty: room.included,
    slots: slotsFor(b, mini).map(s => ({
      index: s.index, label: slotLabel(s),
      open: !takenSet.has(s.index) && !blocked.has(s.index) && Date.parse(s.startISO) > Date.now(),
    })),
  })
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const rl = await rateLimit(`mini-signup:${clientIp(req)}`, 12, 60 * 60 * 1000, { failOpen: true })
  if (!rl.allowed) return NextResponse.json({ error: rl.message }, { status: 429 })
  let r
  try { r = await load(params.token) } catch { return NextResponse.json({ error: 'We couldn’t save that just now — please try again.' }, { status: 503 }) }
  if (!r) return NextResponse.json({ error: 'This sign-up link isn’t valid.' }, { status: 404 })
  const { db, mini, booking: b, taken } = r
  if (mini.status === 'cancelled' || b.status === 'cancelled') return NextResponse.json({ error: 'This mini session day was cancelled.' }, { status: 400 })
  if (mini.status === 'closed' || (b.status !== 'confirmed' && b.status !== 'planned') || signupsClosed(b, mini)) return NextResponse.json({ error: 'Sign-ups are closed. Reach out to your photographer directly.' }, { status: 400 })

  const body = await req.json().catch(() => ({} as any))
  const name = cleanText(body.name, 80)
  const email = cleanEmail(body.email)
  const phone = cleanPhone(body.phone)
  if (!name) return NextResponse.json({ error: 'Add your name.' }, { status: 400 })
  if (!email) return NextResponse.json({ error: 'Add a valid email — your confirmation goes there.' }, { status: 400 })
  if (!phone) return NextResponse.json({ error: 'Add a 10-digit phone number so your photographer can reach you.' }, { status: 400 })

  const room = partyRoom(b, mini, await guestSettings(db)).max
  const party = Math.round(Number(body.party) || 0)
  if (party < 1) return NextResponse.json({ error: 'How many people are coming, including you?' }, { status: 400 })
  if (party > room) return NextResponse.json({ error: `Each slot fits up to ${room} ${room === 1 ? 'person' : 'people'}, including you. The studio has a strict headcount.` }, { status: 400 })

  const i = Number(body.slot)
  const slot = slotsFor(b, mini).find(s => s.index === i)
  if (!slot || (mini.blocked_slots ?? []).includes(i) || Date.parse(slot.startISO) <= Date.now()) {
    return NextResponse.json({ error: 'That time isn’t available. Pick another.' }, { status: 400 })
  }
  if (taken.some(t => t.slot_index === i || t.pending_slot === i)) return NextResponse.json({ error: 'Someone just took that time. Pick another.' }, { status: 409 })
  if (taken.some(t => (t.email || '').toLowerCase() === email)) {
    return NextResponse.json({ error: 'You already have a slot. Use the link in your confirmation email to switch times.' }, { status: 409 })
  }

  const { data, error } = await db.from('mini_session_clients').insert({
    mini_session_id: mini.id, slot_index: i, name, email, phone, party_size: party,
    sms_ok: !!body.smsOk, added_by: 'client', told_start: b.start_time,
  }).select('*')
  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: /one_email/.test(error.message)
        ? 'You already have a slot. Use the link in your confirmation email to switch times.'
        : 'Someone just took that time. Pick another.' }, { status: 409 })
    }
    console.error('[minis] signup insert failed', error)
    return NextResponse.json({ error: 'We couldn’t save that — please try again.' }, { status: 500 })
  }
  const c = data![0] as MiniClient
  const ctx = await ctxFor(db, mini, b)
  if (ctx) await sendClientConfirmation(ctx, c)
  return NextResponse.json({ ok: true, pending: !!b.planned, token: c.manage_token, when: `${fmtDay(slot.startISO)}, ${slotLabel(slot)}` })
}
