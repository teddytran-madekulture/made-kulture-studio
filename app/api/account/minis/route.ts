// GET /api/account/minis — the signed-in photographer's upcoming bookings, each
// with its Mini Sessions summary if one is set up. Same ownership rule as
// /api/account/bookings: auth id OR a customer row with the account's email.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'
import { validatePlanWindow } from '@/lib/mini-sessions-server'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET() {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const db = supabaseAdmin()

  const { data: custRows, error: cErr } = await db.from('customers').select('id').eq('email', (user.email ?? '').toLowerCase())
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
  const ors = [`auth_user_id.eq.${user.id}`]
  const ids = (custRows ?? []).map(c => c.id)
  if (ids.length) ors.push(`customer_id.in.(${ids.join(',')})`)

  const { data: rows, error } = await db.from('bookings')
    .select('id, start_time, end_time, status, set_id, sets ( name )')
    .or(ors.join(',')).eq('status', 'confirmed')
    .gt('end_time', new Date(Date.now() - 2 * 86_400_000).toISOString())
    .order('start_time')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const bIds = (rows ?? []).map(b => b.id)
  const minis: Record<string, any> = {}
  if (bIds.length) {
    const { data: ms, error: mErr } = await db.from('mini_sessions').select('id, booking_id, status, title').in('booking_id', bIds)
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })
    const mIds = (ms ?? []).map(m => m.id)
    const counts: Record<string, number> = {}
    if (mIds.length) {
      const { data: cs, error: csErr } = await db.from('mini_session_clients').select('mini_session_id').in('mini_session_id', mIds).eq('status', 'booked')
      if (csErr) return NextResponse.json({ error: csErr.message }, { status: 500 })
      for (const c of cs ?? []) counts[c.mini_session_id] = (counts[c.mini_session_id] ?? 0) + 1
    }
    for (const m of ms ?? []) minis[m.booking_id] = { ...m, booked: counts[m.id] ?? 0 }
  }

  // Planned days (migration 161): mini days with no booking yet.
  const { data: plans, error: plErr } = await db.from('mini_sessions')
    .select('id, status, title, planned_start, planned_end, planned_buyout, sets:planned_set_id ( name )')
    .eq('owner_user_id', user.id).is('booking_id', null).neq('status', 'cancelled')
    .gt('planned_end', new Date().toISOString()).order('planned_start')
  if (plErr) return NextResponse.json({ error: plErr.message }, { status: 500 })
  const planCounts: Record<string, number> = {}
  if (plans?.length) {
    const { data: pcs } = await db.from('mini_session_clients').select('mini_session_id').in('mini_session_id', plans.map(p => p.id)).eq('status', 'booked')
    for (const c of pcs ?? []) planCounts[c.mini_session_id] = (planCounts[c.mini_session_id] ?? 0) + 1
  }

  return NextResponse.json({
    plans: (plans ?? []).map((p: any) => ({
      id: p.id, title: p.title, start_time: p.planned_start, end_time: p.planned_end,
      place: p.planned_buyout ? 'Full warehouse' : (p.sets?.name ?? 'Set'), requested: planCounts[p.id] ?? 0,
    })),
    bookings: (rows ?? []).map((b: any) => ({
      id: b.id, start_time: b.start_time, end_time: b.end_time,
      place: b.set_id ? (b.sets?.name ?? 'Set') : 'Full warehouse',
      mini: minis[b.id] ?? null,
    })),
  })
}

// POST /api/account/minis — PLAN a mini day before booking (migration 161).
// { setId | buyout: true, date: 'YYYY-MM-DD', startHour, endHour }
// Holds no studio time: it's the window the photographer means to book.
export async function POST(req: Request) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in first.' }, { status: 401 })
  const db = supabaseAdmin()
  const body = await req.json().catch(() => ({} as any))
  const v = await validatePlanWindow(db, { date: String(body.date || ''), startHour: Number(body.startHour), endHour: Number(body.endHour), setId: body.setId ?? null, buyout: !!body.buyout })
  if (!v.ok) return NextResponse.json({ error: (v as any).error }, { status: 400 })
  const { start, end, setId } = v as any
  const buyout = !!body.buyout
  const { count } = await db.from('mini_sessions').select('id', { count: 'exact', head: true })
    .eq('owner_user_id', user.id).is('booking_id', null).neq('status', 'cancelled').gt('planned_end', new Date().toISOString())
  if ((count ?? 0) >= 5) return NextResponse.json({ error: 'You have 5 planned days already — book or cancel one first.' }, { status: 400 })
  const { data, error } = await db.from('mini_sessions').insert({
    booking_id: null, owner_user_id: user.id, planned_set_id: setId, planned_buyout: buyout,
    planned_start: start, planned_end: end, announced_start: start,
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: (data as any).id })
}
