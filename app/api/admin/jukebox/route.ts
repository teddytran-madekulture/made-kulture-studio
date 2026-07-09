// GET /api/admin/jukebox?zone=slug — everything the admin console needs for one
// zone: the zone list (for tabs), this zone's config, pending requests, the
// approved up-next, now-playing, and a little played history.

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { isConnected, spotifyConfigured } from '@/lib/spotify'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const REQ_COLS = 'id, external_id, source, title, artist, thumbnail_url, duration_sec, requester_name, requester_device, status, created_at, approved_at'

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseAdmin()

  const { data: zones } = await db
    .from('jukebox_zones')
    .select('id, slug, name, source, is_open, explicit_filter, auto_approve, house_playlist_url, now_playing_id, sort')
    .order('sort', { ascending: true })

  const { connected: spotifyConnected, email: spotifyEmail } = await isConnected()
  const spotify = { configured: spotifyConfigured(), connected: spotifyConnected, email: spotifyEmail }

  const slug = (req.nextUrl.searchParams.get('zone') || zones?.[0]?.slug || '').trim()
  const zone = (zones ?? []).find(z => z.slug === slug) || zones?.[0]
  if (!zone) return NextResponse.json({ zones: zones ?? [], zone: null, pending: [], up_next: [], now_playing: null, played: [], spotify })

  const [{ data: pending }, { data: up_next }, { data: played }] = await Promise.all([
    db.from('jukebox_requests').select(REQ_COLS).eq('zone_id', zone.id).eq('status', 'pending').order('created_at', { ascending: true }),
    db.from('jukebox_requests').select(REQ_COLS).eq('zone_id', zone.id).eq('status', 'approved').order('approved_at', { ascending: true }),
    db.from('jukebox_requests').select(REQ_COLS).eq('zone_id', zone.id).in('status', ['played', 'skipped']).order('played_at', { ascending: false }).limit(15),
  ])

  let now_playing: any = null
  if (zone.now_playing_id) {
    const { data } = await db.from('jukebox_requests').select(REQ_COLS).eq('id', zone.now_playing_id).single()
    if (data && data.status === 'playing') now_playing = data
  }

  return NextResponse.json({ zones: zones ?? [], zone, pending: pending ?? [], up_next: up_next ?? [], now_playing, played: played ?? [], spotify })
}
