// GET /api/admin/minis — every Mini Sessions day from yesterday on, with its
// roster, so the studio can see who is supposed to be on the floor and when.
import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { BOOKING_SELECT, guestSettings, rosterView, photographerName, settleLinkStatus } from '@/lib/mini-sessions-server'
import { fmtDay, fmtTime, type MiniSession, type MiniClient } from '@/lib/mini-sessions'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseAdmin()
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const { data: upcoming, error } = await db.from('mini_sessions').select(`*, bookings!inner ( ${BOOKING_SELECT} )`)
    .gt('bookings.end_time', since).order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Older days stay listed while their extra-guest bill still needs attention.
  const { data: owing, error: oErr } = await db.from('mini_sessions').select(`*, bookings!inner ( ${BOOKING_SELECT} )`)
    .in('extra_charge_status', ['charging', 'review', 'link_sent'])
  if (oErr) return NextResponse.json({ error: oErr.message }, { status: 500 })
  const seen = new Set<string>()
  const ms = [...(upcoming ?? []), ...(owing ?? [])].filter((m: any) => !seen.has(m.id) && !!seen.add(m.id))
  const ids = (ms ?? []).map((m: any) => m.id)
  const { data: cs, error: cErr } = ids.length
    ? await db.from('mini_session_clients').select('*').in('mini_session_id', ids)
    : { data: [], error: null }
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
  const gs = await guestSettings(db)

  const days = await Promise.all((ms ?? []).map(async (row: any) => {
    const { bookings: b, ...raw } = row
    const mini = await settleLinkStatus(db, raw as MiniSession)
    const clients = ((cs ?? []) as MiniClient[]).filter(c => c.mini_session_id === mini.id)
    return {
      id: mini.id, status: mini.status, title: mini.title,
      bookingId: b.id, bookingStatus: b.status, start: b.start_time,
      day: fmtDay(b.start_time), time: `${fmtTime(b.start_time)} – ${fmtTime(b.end_time)}`,
      place: b.set_id ? (b.sets?.name ?? 'Set') : 'Full warehouse',
      photographer: await photographerName(db, b, mini.owner_user_id),
      photographerPhone: b.customers?.phone ?? null,
      roster: rosterView(b, mini as MiniSession, clients, gs),
    }
  }))
  days.sort((a, z) => Date.parse(a.start) - Date.parse(z.start))
  return NextResponse.json({ days, extraFee: gs.extraFee })
}

// POST /api/admin/minis { extraFee } — the flat fee per extra guest per slot
// (whole dollars). Applies to charges not yet made.
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({} as any))
  // Settle a day stuck in review: Teddy checked Square and either collected it
  // himself ('charged') or isn't billing it ('waive').
  if (body.action === 'resolve') {
    const outcome = body.outcome === 'charged' ? 'charged' : body.outcome === 'waive' ? 'none' : null
    if (!outcome || !body.miniId) return NextResponse.json({ error: 'Pick charged or waive.' }, { status: 400 })
    const { data, error } = await supabaseAdmin().from('mini_sessions')
      .update({ extra_charge_status: outcome, ...(outcome === 'none' ? { extra_charge_cents: 0 } : {}), extra_charged_at: new Date().toISOString() })
      .eq('id', String(body.miniId)).in('extra_charge_status', ['review', 'link_sent']).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data?.length) return NextResponse.json({ error: 'That day is no longer waiting on a decision.' }, { status: 409 })
    return NextResponse.json({ ok: true })
  }
  if (body.extraFee === '' || body.extraFee == null) return NextResponse.json({ error: 'Enter a fee.' }, { status: 400 })
  const fee = Math.round(Number(body.extraFee))
  if (!Number.isFinite(fee) || fee < 0 || fee > 100) return NextResponse.json({ error: 'Use a whole-dollar amount from 0 to 100.' }, { status: 400 })
  const db = supabaseAdmin()
  // Update-then-insert, same as the other settings writers (key isn't guaranteed unique-indexed).
  let { data, error } = await db.from('studio_settings').update({ value: String(fee) }).eq('key', 'mini_extra_guest_fee').select('key')
  if (!error && !data?.length) ({ data, error } = await db.from('studio_settings').insert({ key: 'mini_extra_guest_fee', value: String(fee) }).select('key'))
  if (error || !data?.length) return NextResponse.json({ error: error?.message || 'Not saved.' }, { status: 500 })
  return NextResponse.json({ ok: true, extraFee: fee })
}
