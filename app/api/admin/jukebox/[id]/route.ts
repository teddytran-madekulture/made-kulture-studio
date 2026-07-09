// POST /api/admin/jukebox/[id] { action: 'approve' | 'reject' | 'skip' | 'remove' }
// Teddy's controls. approve → joins the up-next queue. skip → drops the
// currently-playing song and clears now_playing so the player advances. reject/
// remove → discard a pending/queued request.

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }) }
  const action = String(b?.action ?? '')
  const db = supabaseAdmin()

  const { data: row } = await db
    .from('jukebox_requests').select('id, zone_id, status').eq('id', params.id).single()
  if (!row) return NextResponse.json({ error: 'Not found.' }, { status: 404 })

  if (action === 'approve') {
    await db.from('jukebox_requests').update({ status: 'approved', approved_at: new Date().toISOString() }).eq('id', row.id)
    return NextResponse.json({ success: true })
  }

  if (action === 'reject' || action === 'remove') {
    await db.from('jukebox_requests').update({ status: 'rejected' }).eq('id', row.id)
    // If it was the current track, clear now_playing so the player moves on.
    await db.from('jukebox_zones').update({ now_playing_id: null }).eq('id', row.zone_id).eq('now_playing_id', row.id)
    return NextResponse.json({ success: true })
  }

  if (action === 'skip') {
    await db.from('jukebox_requests').update({ status: 'skipped', played_at: new Date().toISOString() }).eq('id', row.id)
    await db.from('jukebox_zones').update({ now_playing_id: null }).eq('id', row.zone_id).eq('now_playing_id', row.id)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
