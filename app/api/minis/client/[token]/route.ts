// GET  /api/minis/client/[token] — a client's own slot (from their email).
// POST /api/minis/client/[token] — { action: 'cancel' } | { action: 'switch', slot }
//
// ⚠️ The client token reaches ONE sign-up. Changes stop at the photographer's
// cutoff — after that the roster is final and changes go through them.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { bookingForMini, ctxFor, notifyPhotographer, sendClientMoved, STUDIO_ADDRESS } from '@/lib/mini-sessions-server'
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
  const b = await bookingForMini(db, m as MiniSession)
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
  const { data: taken } = await db.from('mini_session_clients').select('slot_index, pending_slot').eq('mini_session_id', mini.id).eq('status', 'booked')
  // A slot someone asked to switch into (approval on) is held for them.
  const takenSet = new Set((taken ?? []).flatMap(t => t.pending_slot != null ? [t.slot_index, t.pending_slot] : [t.slot_index]))
  const pending = c.pending_slot != null ? slots.find(s => s.index === c.pending_slot) : null
  const blocked = new Set(mini.blocked_slots ?? [])
  const cancelled = mini.status === 'cancelled' || b.status === 'cancelled'
  return NextResponse.json({
    name: c.name, party: c.party_size, status: cancelled ? 'cancelled' : c.status,
    photographer: ctx?.photographer ?? 'Your photographer',
    title: mini.title, note: mini.note, address: STUDIO_ADDRESS,
    day: fmtDay(b.start_time),
    slot: mine ? slotLabel(mine) : null,
    pending: !!(b as any).planned,
    approveSwitches: !!mini.approve_switches,
    pendingSlot: pending ? slotLabel(pending) : null,
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

  if (body.action === 'withdraw') {
    const { data, error } = await db.from('mini_session_clients').update({ pending_slot: null, updated_at: now }).eq('id', c.id).eq('status', 'booked').select('id')
    if (error || !data?.length) return NextResponse.json({ error: 'We couldn’t withdraw that — please try again.' }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  if (body.action === 'switch') {
    const i = Number(body.slot)
    const s = slotsFor(b, mini).find(x => x.index === i)
    if (!s || i === c.slot_index || (mini.blocked_slots ?? []).includes(i) || Date.parse(s.startISO) <= Date.now()) return NextResponse.json({ error: 'That time isn’t available.' }, { status: 400 })
    const { data: others } = await db.from('mini_session_clients').select('id, slot_index, pending_slot')
      .eq('mini_session_id', mini.id).eq('status', 'booked').neq('id', c.id)
    if ((others ?? []).some(o => o.slot_index === i || o.pending_slot === i)) return NextResponse.json({ error: 'Someone just took that time. Pick another.' }, { status: 409 })

    if (mini.approve_switches) {
      // A request, not a move: the photographer approves it from the roster.
      const { data: asked, error } = await db.from('mini_session_clients').update({ pending_slot: i, updated_at: now })
        .eq('id', c.id).eq('status', 'booked').select('id')
      if (error) return NextResponse.json({ error: 'We couldn’t send that request — please try again.' }, { status: 500 })
      if (!asked?.length) return NextResponse.json({ error: 'This slot was already changed.' }, { status: 409 })
      if (ctx) await notifyPhotographer(ctx, `${c.name || 'A client'} asked to switch mini session times`,
        `${esc(c.name || 'A client')} (party of ${c.party_size}) wants to move from ${oldSlot ? esc(slotLabel(oldSlot)) : 'their slot'} to <b>${esc(slotLabel(s))}</b> on ${esc(fmtDay(b.start_time))}. The new time is held for them until you approve or decline it on your roster.`)
      return NextResponse.json({ ok: true, requested: true, slot: slotLabel(s) })
    }
    const { data: moved, error } = await db.from('mini_session_clients').update({ slot_index: i, pending_slot: null, reminder_sent_at: null, updated_at: now }).eq('id', c.id).eq('status', 'booked').select('id')
    if (error) return NextResponse.json({ error: error.code === '23505' ? 'Someone just took that time. Pick another.' : 'We couldn’t switch that — please try again.' }, { status: error.code === '23505' ? 409 : 500 })
    if (!moved?.length) return NextResponse.json({ error: 'This slot was already changed.' }, { status: 409 })
    if (ctx) {
      await sendClientMoved(ctx, { ...c, slot_index: i }, 'slot')
      await notifyPhotographer(ctx, `${c.name || 'A client'} switched mini session times`,
        `${esc(c.name || 'A client')} moved from ${oldSlot ? esc(slotLabel(oldSlot)) : 'their slot'} to ${esc(slotLabel(s))} on ${esc(fmtDay(b.start_time))}.`)
    }
    return NextResponse.json({ ok: true, slot: slotLabel(s) })
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
