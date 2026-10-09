// GET /api/account/minis — the signed-in photographer's upcoming bookings, each
// with its Mini Sessions summary if one is set up. Same ownership rule as
// /api/account/bookings: auth id OR a customer row with the account's email.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'

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

  return NextResponse.json({
    bookings: (rows ?? []).map((b: any) => ({
      id: b.id, start_time: b.start_time, end_time: b.end_time,
      place: b.set_id ? (b.sets?.name ?? 'Set') : 'Full warehouse',
      mini: minis[b.id] ?? null,
    })),
  })
}
