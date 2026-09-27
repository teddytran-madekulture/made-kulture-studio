// GET /api/jukebox/now?zone=main-studio
//
// The kiosk tablets' NOW PLAYING bar (2026-09-27). Deliberately NOT
// /api/jukebox/state: that one returns the whole approved queue (up to 50 rows)
// and is already the most-called route in the app. The bar needs four fields.
//
// ⚠️ CDN-CACHED FOR 30s (s-maxage). Ten tablets asking once a minute collapse
// into at most ~2 function runs a minute, whatever the tablet count. A song
// title up to 30s stale on a wall screen is fine. Do NOT add a per-tablet or
// per-device query param — it would split the cache and undo this.
// Background: a flat 5s jukebox poll once ate 78% of all Vercel compute. See
// vercel-cpu-jukebox-polling.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

let _db: ReturnType<typeof supabaseAdmin> | null = null
const db = () => (_db ??= supabaseAdmin())

// Same freshness rule as /api/jukebox/state: a house track the player hasn't
// reported recently means the player is asleep — say nothing rather than name
// a song that stopped an hour ago.
const HOUSE_FRESH_MS = 45_000

export async function GET(req: NextRequest) {
  const slug = (req.nextUrl.searchParams.get('zone') || '').trim()
  if (!slug) return NextResponse.json({ error: 'Missing zone.' }, { status: 400 })

  const { data: zone, error } = await db()
    .from('jukebox_zones')
    .select('is_open, paused, now_playing_id, house_now_title, house_now_artist, house_now_at')
    .eq('slug', slug).maybeSingle()
  // ⚠️ supabase-js does not throw. A failed read must not look like "music off".
  if (error) {
    console.error('[jukebox/now] zone read failed:', error.message)
    return NextResponse.json({ error: 'Unavailable' }, { status: 503 })
  }
  if (!zone) return NextResponse.json({ error: 'Unknown zone.' }, { status: 404 })

  let title: string | null = null
  let artist: string | null = null
  if (zone.now_playing_id) {
    const { data: r } = await db().from('jukebox_requests')
      .select('title, artist, status').eq('id', zone.now_playing_id).maybeSingle()
    if (r && r.status === 'playing') { title = r.title; artist = r.artist || null }
  }
  if (!title && !zone.paused && zone.house_now_title && zone.house_now_at) {
    const age = Date.now() - new Date(zone.house_now_at).getTime()
    if (age >= 0 && age < HOUSE_FRESH_MS) { title = zone.house_now_title; artist = zone.house_now_artist || null }
  }

  return NextResponse.json(
    { open: !!zone.is_open, paused: !!zone.paused, title, artist },
    { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=30' } },
  )
}
