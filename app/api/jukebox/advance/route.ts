// POST /api/jukebox/advance { zone, endedId?, key? }
// Driven by the player tablet. Marks the just-ended song played, then promotes
// the next approved song to "playing" (updating the zone's now_playing_id). If
// nothing is approved, clears now_playing so the player falls back to the house
// playlist. Optionally protected by JUKEBOX_PLAYER_KEY.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const REQ_COLS = 'id, external_id, source, title, artist, thumbnail_url, duration_sec, requester_name, status'

function keyOk(key: unknown): boolean {
  const required = process.env.JUKEBOX_PLAYER_KEY
  if (!required) return true
  if (typeof key !== 'string' || !key) return false
  // The Set D kiosk tablet hosts the main-studio music inside the kiosk page
  // (2026-10-05) and carries the KIOSK key, not the player key. Same trust
  // level: both are wall-tablet credentials that live in a start URL.
  return key === required || (!!process.env.KIOSK_KEY && key === process.env.KIOSK_KEY)
}

export async function POST(req: NextRequest) {
  let b: any = {}
  try { b = await req.json() } catch {}
  if (!keyOk(b?.key)) return NextResponse.json({ error: 'Unauthorized player.' }, { status: 401 })

  const slug = String(b?.zone ?? '').trim()
  const endedId = String(b?.endedId ?? '').trim() || null
  if (!slug) return NextResponse.json({ error: 'Missing zone.' }, { status: 400 })

  const db = supabaseAdmin()
  const { data: zone } = await db
    .from('jukebox_zones').select('id, now_playing_id').eq('slug', slug).single()
  if (!zone) return NextResponse.json({ error: 'Unknown zone.' }, { status: 404 })

  // Retire the ended track (or a still-playing current if we're forcing on).
  const retireId = endedId || zone.now_playing_id
  if (retireId) {
    await db.from('jukebox_requests')
      .update({ status: 'played', played_at: new Date().toISOString() })
      .eq('id', retireId).eq('status', 'playing')
  }

  // Promote the next approved song (oldest approval first).
  const { data: next } = await db
    .from('jukebox_requests').select(REQ_COLS)
    .eq('zone_id', zone.id).eq('status', 'approved')
    .order('approved_at', { ascending: true }).limit(1).maybeSingle()

  if (next) {
    await db.from('jukebox_requests').update({ status: 'playing', played_at: null }).eq('id', next.id)
    await db.from('jukebox_zones').update({ now_playing_id: next.id }).eq('id', zone.id)
    return NextResponse.json({ now_playing: { ...next, status: 'playing' } })
  }

  await db.from('jukebox_zones').update({ now_playing_id: null }).eq('id', zone.id)
  return NextResponse.json({ now_playing: null })
}
