// POST /api/jukebox/advance { zone, endedId?, key? }
// Driven by the player tablet. Marks the just-ended song played, then promotes
// the next approved song to "playing" (updating the zone's now_playing_id). If
// nothing is approved, clears now_playing so the player falls back to the house
// playlist. Optionally protected by JUKEBOX_PLAYER_KEY.
//
// 2026-10-10 KEEP THE VIBE GOING: when the queue empties after a guest song
// finished NATURALLY (a skip is not a vote for more of the same), a YouTube zone
// with vibe_enabled records that song as the seed of a 30-minute YouTube Mix and
// returns it as `vibe`; the player plays the Mix instead of the house playlist.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { VIBE_MINUTES } from '@/lib/jukebox'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const REQ_COLS = 'id, external_id, source, title, artist, thumbnail_url, duration_sec, requester_name, status'

function keyOk(key: unknown): boolean {
  const required = process.env.JUKEBOX_PLAYER_KEY
  // 2026-10-06: fail CLOSED — an unset key used to make this route public.
  if (!required) { console.error('[auth] key env var is not set — refusing'); return false }
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
    .from('jukebox_zones').select('id, now_playing_id, source, vibe_enabled').eq('slug', slug).single()
  if (!zone) return NextResponse.json({ error: 'Unknown zone.' }, { status: 404 })

  // Retire the ended track (or a still-playing current if we're forcing on).
  const retireId = endedId || zone.now_playing_id
  let retired: { external_id: string; title: string; source: string } | null = null
  if (retireId) {
    const { data } = await db.from('jukebox_requests')
      .update({ status: 'played', played_at: new Date().toISOString() })
      .eq('id', retireId).eq('status', 'playing')
      .select('external_id, title, source')
    retired = (data && data[0]) || null
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

  // Queue empty. Seed the vibe from the song that just finished — only when it
  // played to its end (endedId: the player saw it finish) on a YouTube zone.
  const seedable = !!endedId && retired && retired.source !== 'spotify' && zone.source !== 'spotify' && zone.vibe_enabled !== false
  if (seedable) {
    const until = new Date(Date.now() + VIBE_MINUTES * 60_000).toISOString()
    const { error } = await db.from('jukebox_zones').update({
      now_playing_id: null, vibe_seed_id: retired!.external_id, vibe_seed_title: retired!.title, vibe_until: until,
    }).eq('id', zone.id)
    if (!error) return NextResponse.json({ now_playing: null, vibe: { seed_id: retired!.external_id, seed_title: retired!.title, until } })
    console.error('[jukebox/advance] vibe seed failed:', error.message)
  }
  await db.from('jukebox_zones').update({ now_playing_id: null }).eq('id', zone.id)
  return NextResponse.json({ now_playing: null })
}
