// GET /api/jukebox/state?zone=slug&device=abc
// Public snapshot used by BOTH the guest request page and the Fire-tablet
// player: zone config, what's playing now, the approved up-next list, and (if a
// device id is passed) that device's own recent requests + their status.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// This is the most-called route in the app by a wide margin — both tablets plus
// every open guest phone hit it continuously. supabaseAdmin() builds a NEW
// client on every call, so that construction was running tens of thousands of
// times a day for nothing. Build it once per warm instance instead: the client
// carries no per-request state (service-role key, no session persistence), so
// sharing it across requests is safe.
let _db: ReturnType<typeof supabaseAdmin> | null = null
function sharedDb() {
  if (!_db) _db = supabaseAdmin()
  return _db
}

const REQ_COLS ='id, external_id, source, title, artist, thumbnail_url, duration_sec, requester_name, status'
// Same list plus the owner, so a guest's own rows can be tagged without ever
// handing other people's device ids to the browser — see stripDevice().
const REQ_COLS_OWNED = `${REQ_COLS}, requester_device`

// The house track is only worth showing if the player reported it recently. The
// tablet heartbeats every ~15s, so anything older than this means the player is
// asleep, offline or paused — better to say nothing than to name a song that
// stopped playing an hour ago.
const HOUSE_FRESH_MS = 45_000

// requester_device never goes to the client; it becomes a boolean for the asking
// device only.
function stripDevice(rows: any[], device: string) {
  return (rows ?? []).map(({ requester_device, ...r }: any) => ({
    ...r,
    mine: !!device && requester_device === device,
  }))
}

export async function GET(req: NextRequest) {
  const slug = (req.nextUrl.searchParams.get('zone') || '').trim()
  const device = (req.nextUrl.searchParams.get('device') || '').trim()
  if (!slug) return NextResponse.json({ error: 'Missing zone.' }, { status: 400 })

  const db = sharedDb()
  const { data: zone } = await db
    .from('jukebox_zones')
    .select('id, slug, name, is_open, paused, source, house_playlist_url, now_playing_id, house_now_title, house_now_artist, house_now_at')
    .eq('slug', slug).single()
  if (!zone) return NextResponse.json({ error: 'Unknown zone.' }, { status: 404 })

  // The three follow-up reads only depend on the zone, never on each other, so
  // they go out together instead of one-after-another. Same data, roughly a
  // third of the wall time — which on a route called this often is the
  // difference between holding a function warm and letting it go.
  const [nowRes, upNextRes, mineRes] = await Promise.all([
    zone.now_playing_id
      ? db.from('jukebox_requests').select(REQ_COLS).eq('id', zone.now_playing_id).single()
      : Promise.resolve({ data: null }),
    db.from('jukebox_requests').select(REQ_COLS_OWNED)
      .eq('zone_id', zone.id).eq('status', 'approved')
      .order('approved_at', { ascending: true }).limit(50),
    device
      ? db.from('jukebox_requests').select('id, title, artist, status, created_at')
          .eq('zone_id', zone.id).eq('requester_device', device)
          .in('status', ['pending', 'approved', 'playing'])
          .order('created_at', { ascending: false }).limit(5)
      : Promise.resolve({ data: [] }),
  ])

  let now_playing: any = null
  if (nowRes.data && (nowRes.data as any).status === 'playing') now_playing = nowRes.data

  const up_next = upNextRes.data
  const mine: any[] = mineRes.data ?? []

  // What the speakers are actually playing when nobody's request is up. The
  // player owns this (the playlist engine picks the track, not us), so it
  // reports back and we relay it. Without this the guest page said the literal
  // words "House playlist" during the ~95% of the day house music is on.
  let house_now: { title: string; artist: string | null } | null = null
  if (!now_playing && !zone.paused && zone.house_now_title && zone.house_now_at) {
    const age = Date.now() - new Date(zone.house_now_at).getTime()
    if (age >= 0 && age < HOUSE_FRESH_MS) {
      house_now = { title: zone.house_now_title, artist: zone.house_now_artist || null }
    }
  }

  return NextResponse.json({
    zone: {
      slug: zone.slug, name: zone.name, is_open: zone.is_open, paused: zone.paused,
      source: zone.source, house_playlist_url: zone.house_playlist_url,
    },
    now_playing,
    house_now,
    up_next: stripDevice(up_next ?? [], device),
    mine,
  })
}
