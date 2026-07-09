// GET /api/jukebox/state?zone=slug&device=abc
// Public snapshot used by BOTH the guest request page and the Fire-tablet
// player: zone config, what's playing now, the approved up-next list, and (if a
// device id is passed) that device's own recent requests + their status.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const REQ_COLS = 'id, external_id, source, title, artist, thumbnail_url, duration_sec, requester_name, status'

export async function GET(req: NextRequest) {
  const slug = (req.nextUrl.searchParams.get('zone') || '').trim()
  const device = (req.nextUrl.searchParams.get('device') || '').trim()
  if (!slug) return NextResponse.json({ error: 'Missing zone.' }, { status: 400 })

  const db = supabaseAdmin()
  const { data: zone } = await db
    .from('jukebox_zones')
    .select('id, slug, name, is_open, paused, source, house_playlist_url, now_playing_id')
    .eq('slug', slug).single()
  if (!zone) return NextResponse.json({ error: 'Unknown zone.' }, { status: 404 })

  let now_playing: any = null
  if (zone.now_playing_id) {
    const { data } = await db.from('jukebox_requests').select(REQ_COLS).eq('id', zone.now_playing_id).single()
    if (data && data.status === 'playing') now_playing = data
  }

  const { data: up_next } = await db
    .from('jukebox_requests').select(REQ_COLS)
    .eq('zone_id', zone.id).eq('status', 'approved')
    .order('approved_at', { ascending: true }).limit(50)

  let mine: any[] = []
  if (device) {
    const { data } = await db
      .from('jukebox_requests').select('id, title, artist, status, created_at')
      .eq('zone_id', zone.id).eq('requester_device', device)
      .in('status', ['pending', 'approved', 'playing'])
      .order('created_at', { ascending: false }).limit(5)
    mine = data ?? []
  }

  return NextResponse.json({
    zone: {
      slug: zone.slug, name: zone.name, is_open: zone.is_open, paused: zone.paused,
      source: zone.source, house_playlist_url: zone.house_playlist_url,
    },
    now_playing,
    up_next: up_next ?? [],
    mine,
  })
}
