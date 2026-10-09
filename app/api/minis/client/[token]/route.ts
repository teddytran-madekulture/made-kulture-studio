// GET  /api/minis/client/[token] — a client's own slot (from their email).
// POST /api/minis/client/[token] — { action: 'cancel' } | { action: 'switch', slot }
//
// ⚠️ The client token reaches ONE sign-up. Changes stop at the photographer's
// cutoff — after that the roster is final and changes go through them.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { BOOKING_SELECT, ctxFor, notifyPhotographer, sendClientMoved, STUDIO_ADDRESS } from '@/lib/mini-sessions-server'
import { slotsFor, signupsClosed, slotLabel, fmtDay, esc, type MiniSession, type MiniClient } from '@/lib/mini-sessions'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
const TOKEN_RE = /^[0-9a-f]{32}$/i

async function load(token: string) {
  if (!TOKEN_RE.test(token)) return null
  const db = supabaseAdmin()
  const { data: c, error } = await db.from('mini_session_clients').select('*').eq('manage_token', token).maybeSingle()
  if (error) throw new Error(error.message)
  if (!c || c.purged_at) return null
  const { data: m } = await db.from('mini_sessions').select('*').eq('id', c.mini_session_id).maybeSingle()
  if (!m) return null
  const { data: b } = await db.from('bookings').select(BOOKING_SELECT).eq('id', m.booking_id).maybeSingle()
  if (!b) return null
  return { db, client: c as MiniClient, mini: m as MiniSession, booking: b as any }
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  let r
  try { r = await load(params.token) } catch { return NextResponse.json({ error: 'We couldn’t load your slot just now — please try again.' }, { status: 503 }) }
  if (!r) return NextResponse.json({ error: 'This link isn’t valid.' }, { status: 404 })
  const { db, client: c, mini, booking: b } = r
  const ctx = await ctxFor(db, mini, b)
  const slots = slotsFor(b, mini)
  const mine = slots.find(s => s.index === c.slot_index)
  const { data: taken } = await db.from('mini_session_clients').select('slot_index').eq('mini_session_id', mini.id).eq('status', 'booked')
  const takenSet = new Set((taken ?? []).map(t => t.slot_index))
  const blocked = new Set(mini.blocked_slots ?? [])
  const cancelled = mini.status === 'cancelled' || b.status === 'cancelled'
  return NextResponse.json({
    name: c.name, party: c.party_size, status: cancelled ? 'cancelled' : c.status,
    photographer: ctx?.photographer ?? 'Your photographer',
    title: mini.title, note: mini.note, address: STUDIO_ADDRESS,
    day: fmtDay(b.start_time),
    slot: mine ? slotLabel(mine) : null,
    canChange: !cancelled && c.status === 'booked' && !signupsClosed(b, mini) && mini.status === 'open',
    openSlots: slots.filter(s => !takenSet.has(s.index) && !blocked.has(s.index) && Date.parse(s.startISO) > Date.now())
      .map(s => ({ index: s.index, label: slotLabel(s) })),
  })
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  let r
  try { r = await load(params.token) } catch { return NextResponse.json({ error: 'We couldn’t save that just now — please try again.' }, { status: 503 }) }
  if (!r) return NextResponse.json({ error: 'This link isn’t valid.' }, { status: 404 })
  const { db, client: c, mini, booking: b } = r
  if (c.status !== 'booked' || mini.status !== 'open' || b.status === 'cancelled') return NextResponse.json({ error: 'This slot can’t be changed.' }, { status: 400 })
  if (signupsClosed(b, mini)) return NextResponse.json({ error: 'Changes are closed for this day — reach out to your photographer directly.' }, { status: 400 })
  const body = await req.json().catch(() => ({} as any))
  const ctx = await ctxFor(db, mini, b)
  const now = new Date().toISOString()
  const oldSlot = slotsFor(b, mini).find(s => s.index === c.slot_index)

  if (body.action === 'cancel') {
    const { data, error } = await db.from('mini_session_clients').update({ status: 'cancelled', updated_at: now })
      .eq('id', c.id).eq('status', 'booked').select('id')
    if (error) return NextResponse.json({ error: 'We couldn’t cancel that — please try again.' }, { status: 500 })
    if (!data?.length) return NextResponse.json({ error: 'This slot was already changed.' }, { status: 409 })
    if (ctx) await notifyPhotographer(ctx, `${c.name || 'A client'} cancelled their mini session`,
      `${esc(c.name || 'A client')} (party of ${c.party_size}) cancelled ${oldSlot ? esc(slotLabel(oldSlot)) : 'their slot'} on ${esc(fmtDay(b.start_time))}. The slot is open again.`)
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'switch') {
    const i = Number(body.slot)
    const s = slotsFor(b, mini).find(x => x.index === i)
    if (!s || (mini.blocked_slots ?? []).includes(i) || Date.parse(s.startISO) <= Date.now()) return NextResponse.json({ error: 'That time isn’t available.' }, { status: 400 })
    const { data: moved, error } = await db.from('mini_session_clients').update({ slot_index: i, reminder_sent_at: null, updated_at: now }).eq('id', c.id).eq('status', 'booked').select('id')
    if (error) return NextResponse.json({ error: error.code === '23505' ? 'Someone just took that time. Pick another.' : 'We couldn’t switch that — please try again.' }, { status: error.code === '23505' ? 409 : 500 })
    if (!moved?.length) return NextResponse.json({ error: 'This slot was already changed.' }, { status: 409 })
    if (ctx) {
      await sendClientMoved(ctx, { ...c, slot_index: i })
      await notifyPhotographer(ctx, `${c.name || 'A client'} switched mini session times`,
        `${esc(c.name || 'A client')} moved from ${oldSlot ? esc(slotLabel(oldSlot)) : 'their slot'} to ${esc(slotLabel(s))} on ${esc(fmtDay(b.start_time))}.`)
    }
    return NextResponse.json({ ok: true, slot: slotLabel(s) })
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
