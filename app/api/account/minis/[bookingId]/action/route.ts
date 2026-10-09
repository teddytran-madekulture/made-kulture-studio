// POST /api/account/minis/[bookingId]/action — the photographer's roster moves.
//   { action: 'block' | 'unblock', slot }
//   { action: 'add', slot, name, email?, phone?, party }   (someone who DM'd them)
//   { action: 'move', clientId, slot }
//   { action: 'remove', clientId, notify }
//   { action: 'checkin', clientId, on }
//   { action: 'message', text, sms }
//   { action: 'close' | 'open' }                           (stop / restart sign-ups)
//   { action: 'approve_switch' | 'decline_switch', clientId } (approval toggle on)
//
// ⚠️ The one-client-per-slot rule is a UNIQUE index in the database (migration
// 158), so a move onto a slot someone just took fails cleanly instead of doubling.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'
import {
  loadForOwner, guestSettings, ctxFor, sendClientConfirmation, sendClientMoved,
  sendClientRemovedOrCancelled, sendClientBroadcast, sendClientSwitchDeclined,
} from '@/lib/mini-sessions-server'
import { cleanText, cleanEmail, cleanPhone, partyRoom, slotsFor, type MiniClient } from '@/lib/mini-sessions'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function POST(req: NextRequest, { params }: { params: { bookingId: string } }) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return bad('Sign in first.', 401)
  const db = supabaseAdmin()
  const r = await loadForOwner(db, user, params.bookingId)
  if (!r.ok) return bad((r as any).error, (r as any).status)
  const { booking: b, mini, clients } = r
  if (!mini) return bad('Set up Mini Sessions on this booking first.')
  if (b.status === 'cancelled') return bad('This booking is cancelled.')

  const body = await req.json().catch(() => ({} as any))
  // A day cancelled with its booking stays closed unless the booking came back
  // (an admin un-cancelled it) and the photographer reopens it.
  if (mini.status === 'cancelled' && body.action !== 'open') return bad('This mini session day was cancelled. Reopen it first.')
  const now = new Date().toISOString()
  const slots = slotsFor(b, mini)
  const slotOk = (i: any) => Number.isInteger(i) && i >= 0 && i < slots.length
  const booked = clients.filter(c => c.status === 'booked')
  const takenBy = (i: number) => booked.find(c => c.slot_index === i)
  const heldBy = (i: number) => booked.find(c => c.pending_slot === i)
  const client = (id: any) => clients.find(c => c.id === id)
  const room = partyRoom(b, mini, await guestSettings(db)).max
  const limit = mini.crew_count + room
  // Extra guests are billed from the roster as it stands after the session, so
  // a client whose slot has started can't be moved or removed — only checked in.
  const started = (c: { slot_index: number }) => { const s = slots.find(x => x.index === c.slot_index); return !!s && Date.parse(s.startISO) <= Date.now() }

  switch (body.action) {
    case 'block':
    case 'unblock': {
      const i = Number(body.slot)
      if (!slotOk(i)) return bad('No such slot.')
      if (body.action === 'block' && takenBy(i)) return bad('Someone is booked in that slot — move or remove them first.')
      if (body.action === 'block' && heldBy(i)) return bad('A client asked to switch into that slot — approve or decline it first.')
      const set = new Set(mini.blocked_slots ?? [])
      body.action === 'block' ? set.add(i) : set.delete(i)
      const { error } = await db.from('mini_sessions').update({ blocked_slots: Array.from(set).sort((a, z) => a - z), updated_at: now }).eq('id', mini.id)
      if (error) return bad(error.message, 500)
      return NextResponse.json({ ok: true })
    }

    case 'add': {
      const i = Number(body.slot)
      if (!slotOk(i)) return bad('No such slot.')
      if (takenBy(i)) return bad('That slot is taken.')
      if (heldBy(i)) return bad('A client asked to switch into that slot — approve or decline it first.')
      const name = cleanText(body.name, 80)
      if (!name) return bad('Add the client’s name.')
      const email = body.email ? cleanEmail(body.email) : null
      if (body.email && !email) return bad('That email doesn’t look right.')
      const phone = body.phone ? cleanPhone(body.phone) : null
      if (body.phone && !phone) return bad('Use a 10-digit phone number.')
      const party = Math.round(Number(body.party) || 1)
      if (party < 1 || party > room) return bad(`Parties can be 1 to ${room} people here (${limit} allowed, crew of ${mini.crew_count}).`)
      const blocked = new Set(mini.blocked_slots ?? [])
      const { data, error } = await db.from('mini_session_clients').insert({
        mini_session_id: mini.id, slot_index: i, name, email, phone, party_size: party,
        sms_ok: false, added_by: 'photographer', told_start: b.start_time,
      }).select('*')
      if (error) return bad(error.code === '23505' ? 'That slot was just taken.' : error.message, error.code === '23505' ? 409 : 500)
      if (blocked.has(i)) await db.from('mini_sessions').update({ blocked_slots: Array.from(blocked).filter(x => x !== i) }).eq('id', mini.id)
      if (body.sendEmail !== false && email) {
        const ctx = await ctxFor(db, mini, b)
        if (ctx) await sendClientConfirmation(ctx, data![0] as MiniClient)
      }
      return NextResponse.json({ ok: true })
    }

    case 'move': {
      const c = client(body.clientId)
      if (!c || !['booked', 'bumped'].includes(c.status)) return bad('Client not found.')
      if (c.status === 'booked' && started(c)) return bad('Their slot has already started, so they stay on the roster as is.')
      if (c.party_size > room) return bad(`Their party of ${c.party_size} is more than the ${room} each slot allows now.`)
      const i = Number(body.slot)
      if (!slotOk(i)) return bad('No such slot.')
      if (takenBy(i) && takenBy(i)!.id !== c.id) return bad('That slot is taken.')
      if (heldBy(i) && heldBy(i)!.id !== c.id) return bad('Another client asked to switch into that slot — approve or decline it first.')
      const { error } = await db.from('mini_session_clients')
        .update({ slot_index: i, status: 'booked', pending_slot: null, reminder_sent_at: null, told_start: b.start_time, updated_at: now }).eq('id', c.id)
      if (error) return bad(error.code === '23505' ? 'That slot was just taken.' : error.message, error.code === '23505' ? 409 : 500)
      const blocked = new Set(mini.blocked_slots ?? [])
      if (blocked.has(i)) await db.from('mini_sessions').update({ blocked_slots: Array.from(blocked).filter(x => x !== i) }).eq('id', mini.id)
      if (body.notify !== false) {
        const ctx = await ctxFor(db, mini, b)
        if (ctx) await sendClientMoved(ctx, { ...c, slot_index: i })
      }
      return NextResponse.json({ ok: true })
    }

    case 'remove': {
      const c = client(body.clientId)
      if (!c || !['booked', 'bumped'].includes(c.status)) return bad('Client not found.')
      if (c.status === 'booked' && started(c)) return bad('Their slot has already started, so they stay on the roster as is.')
      const { error } = await db.from('mini_session_clients').update({ status: 'removed', updated_at: now }).eq('id', c.id)
      if (error) return bad(error.message, 500)
      if (body.notify) {
        const ctx = await ctxFor(db, mini, b)
        if (ctx) await sendClientRemovedOrCancelled(ctx, c, 'removed')
      }
      return NextResponse.json({ ok: true })
    }

    case 'approve_switch':
    case 'decline_switch': {
      const c = client(body.clientId)
      if (!c || c.status !== 'booked' || c.pending_slot == null) return bad('That request is no longer open.')
      const ctx = await ctxFor(db, mini, b)
      if (body.action === 'decline_switch') {
        const { data, error } = await db.from('mini_session_clients').update({ pending_slot: null, updated_at: now })
          .eq('id', c.id).eq('pending_slot', c.pending_slot).select('id')
        if (error) return bad(error.message, 500)
        if (!data?.length) return bad('That request just changed — refresh.', 409)
        if (ctx) await sendClientSwitchDeclined(ctx, c)
        return NextResponse.json({ ok: true })
      }
      const i = c.pending_slot
      if (!slotOk(i)) return bad('That time no longer exists on your booking.')
      if (started(c)) return bad('Their current slot has already started.')
      if (c.party_size > room) return bad(`Their party of ${c.party_size} is more than the ${room} each slot allows now.`)
      if (takenBy(i)) return bad('Someone is already in that slot.')
      const { data, error } = await db.from('mini_session_clients')
        .update({ slot_index: i, pending_slot: null, reminder_sent_at: null, updated_at: now })
        .eq('id', c.id).eq('pending_slot', i).select('id')
      if (error) return bad(error.code === '23505' ? 'Someone is already in that slot.' : error.message, error.code === '23505' ? 409 : 500)
      if (!data?.length) return bad('That request just changed — refresh.', 409)
      if (ctx) await sendClientMoved(ctx, { ...c, slot_index: i })
      return NextResponse.json({ ok: true })
    }

    case 'checkin': {
      const c = client(body.clientId)
      if (!c || c.status !== 'booked') return bad('Client not found.')
      const { error } = await db.from('mini_session_clients').update({ checked_in_at: body.on ? now : null, updated_at: now }).eq('id', c.id)
      if (error) return bad(error.message, 500)
      return NextResponse.json({ ok: true })
    }

    case 'message': {
      const text = String(body.text ?? '').trim().slice(0, 600)
      if (text.length < 3) return bad('Write a message first.')
      if (!booked.length) return bad('No one is booked yet.')
      const ctx = await ctxFor(db, mini, b)
      if (!ctx) return bad('Could not load the booking.', 500)
      // Texts share the studio's daily SMS ceiling, so "also text" works once per
      // 12 hours per day of minis. Claimed before sending; email always goes.
      let withSms = false
      if (body.sms) {
        const since = new Date(Date.now() - 12 * 3_600_000).toISOString()
        const { data: claimed } = await db.from('mini_sessions').update({ last_sms_broadcast_at: now })
          .eq('id', mini.id).or(`last_sms_broadcast_at.is.null,last_sms_broadcast_at.lt.${since}`).select('id')
        withSms = !!claimed?.length
      }
      let emailed = 0, texted = 0
      for (const c of booked) {
        await sendClientBroadcast(ctx, c, text, withSms)
        if (c.email) emailed++
        if (withSms && c.sms_ok && c.phone) texted++
      }
      return NextResponse.json({ ok: true, emailed, texted, smsSkipped: !!body.sms && !withSms })
    }

    case 'close':
    case 'open': {
      const { error } = await db.from('mini_sessions').update({ status: body.action === 'close' ? 'closed' : 'open', updated_at: now }).eq('id', mini.id)
      if (error) return bad(error.message, 500)
      return NextResponse.json({ ok: true })
    }
  }
  return bad('Unknown action.')
}
