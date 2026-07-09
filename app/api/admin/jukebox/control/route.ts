// POST /api/admin/jukebox/control { zone, action }
// Zone-level transport controls for the admin console. The player polls state and
// reacts (plays/pauses/advances). Actions:
//   pause    — freeze the current song
//   play     — resume it
//   next     — skip current, advance to the next approved (also un-pauses)
//   previous — replay the last finished song; the current one plays next (un-pauses)

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }) }
  const slug = String(b?.zone ?? '').trim()
  const action = String(b?.action ?? '')
  if (!slug) return NextResponse.json({ error: 'Missing zone.' }, { status: 400 })

  const db = supabaseAdmin()
  const { data: zone } = await db.from('jukebox_zones').select('id, now_playing_id, paused').eq('slug', slug).single()
  if (!zone) return NextResponse.json({ error: 'Unknown zone.' }, { status: 404 })

  const now = new Date().toISOString()

  if (action === 'pause') {
    await db.from('jukebox_zones').update({ paused: true }).eq('id', zone.id)
    return NextResponse.json({ success: true })
  }

  if (action === 'play') {
    await db.from('jukebox_zones').update({ paused: false }).eq('id', zone.id)
    return NextResponse.json({ success: true })
  }

  if (action === 'next' || action === 'skip') {
    if (zone.now_playing_id) {
      await db.from('jukebox_requests').update({ status: 'skipped', played_at: now }).eq('id', zone.now_playing_id).eq('status', 'playing')
    }
    // Clear now_playing + un-pause; the player promotes the next approved song.
    await db.from('jukebox_zones').update({ now_playing_id: null, paused: false }).eq('id', zone.id)
    return NextResponse.json({ success: true })
  }

  if (action === 'previous') {
    // Most recently finished song.
    const { data: prev } = await db.from('jukebox_requests')
      .select('id').eq('zone_id', zone.id).in('status', ['played', 'skipped'])
      .order('played_at', { ascending: false }).limit(1).maybeSingle()
    if (!prev) return NextResponse.json({ success: true, note: 'nothing-before' })

    // Send the current song back to the FRONT of the up-next queue.
    if (zone.now_playing_id) {
      const { data: firstUp } = await db.from('jukebox_requests')
        .select('approved_at').eq('zone_id', zone.id).eq('status', 'approved')
        .order('approved_at', { ascending: true }).limit(1).maybeSingle()
      const frontTime = firstUp?.approved_at
        ? new Date(new Date(firstUp.approved_at).getTime() - 1000).toISOString()
        : now
      await db.from('jukebox_requests').update({ status: 'approved', approved_at: frontTime, played_at: null }).eq('id', zone.now_playing_id)
    }
    // Replay the previous song now.
    await db.from('jukebox_requests').update({ status: 'playing', played_at: null }).eq('id', prev.id)
    await db.from('jukebox_zones').update({ now_playing_id: prev.id, paused: false }).eq('id', zone.id)
    return NextResponse.json({ success: true })
  }

  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
