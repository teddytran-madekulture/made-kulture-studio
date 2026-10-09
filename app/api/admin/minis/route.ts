// GET /api/admin/minis — every Mini Sessions day from yesterday on, with its
// roster, so the studio can see who is supposed to be on the floor and when.
import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { BOOKING_SELECT, guestSettings, rosterView, photographerName } from '@/lib/mini-sessions-server'
import { headcountLimit, fmtDay, fmtTime, type MiniSession, type MiniClient } from '@/lib/mini-sessions'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseAdmin()
  const since = new Date(Date.now() - 86_400_000).toISOString()
  const { data: ms, error } = await db.from('mini_sessions').select(`*, bookings!inner ( ${BOOKING_SELECT} )`)
    .gt('bookings.end_time', since).order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const ids = (ms ?? []).map((m: any) => m.id)
  const { data: cs, error: cErr } = ids.length
    ? await db.from('mini_session_clients').select('*').in('mini_session_id', ids)
    : { data: [], error: null }
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
  const gs = await guestSettings(db)

  const days = await Promise.all((ms ?? []).map(async (row: any) => {
    const { bookings: b, ...mini } = row
    const clients = ((cs ?? []) as MiniClient[]).filter(c => c.mini_session_id === mini.id)
    const limit = headcountLimit(b, gs)
    return {
      id: mini.id, status: mini.status, title: mini.title,
      bookingId: b.id, bookingStatus: b.status, start: b.start_time,
      day: fmtDay(b.start_time), time: `${fmtTime(b.start_time)} – ${fmtTime(b.end_time)}`,
      place: b.set_id ? (b.sets?.name ?? 'Set') : 'Full warehouse',
      photographer: await photographerName(db, b, mini.owner_user_id),
      photographerPhone: b.customers?.phone ?? null,
      roster: rosterView(b, mini as MiniSession, clients, limit),
    }
  }))
  days.sort((a, z) => Date.parse(a.start) - Date.parse(z.start))
  return NextResponse.json({ days })
}
