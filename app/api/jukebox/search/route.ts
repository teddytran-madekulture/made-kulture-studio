// GET /api/jukebox/search?q=...&zone=slug — searches the ZONE's active source
// (YouTube or Spotify) and returns up to 10 normalized results. Called on submit
// / debounced by the client, never per keystroke.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { searchTracks as spotifySearch } from '@/lib/spotify'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const KEY = process.env.YOUTUBE_API_KEY

// ISO 8601 duration (PT3M14S) → seconds
function isoToSec(iso: string): number {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '')
  if (!m) return 0
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0))
}

async function youtubeSearch(q: string) {
  if (!KEY) return { error: 'YouTube search is not configured.', results: [] as any[] }
  const su = new URL('https://www.googleapis.com/youtube/v3/search')
  su.searchParams.set('part', 'snippet')
  su.searchParams.set('q', q)
  su.searchParams.set('type', 'video')
  su.searchParams.set('videoCategoryId', '10')
  su.searchParams.set('videoEmbeddable', 'true')
  su.searchParams.set('videoSyndicated', 'true') // only videos playable outside youtube.com
  su.searchParams.set('safeSearch', 'moderate')
  su.searchParams.set('maxResults', '10')
  su.searchParams.set('key', KEY)
  const sr = await fetch(su.toString())
  if (!sr.ok) return { error: 'Search unavailable.', results: [] as any[] }
  const sd = await sr.json()
  const ids: string[] = (sd.items || []).map((i: any) => i.id?.videoId).filter(Boolean)
  if (!ids.length) return { results: [] as any[] }

  const vu = new URL('https://www.googleapis.com/youtube/v3/videos')
  vu.searchParams.set('part', 'contentDetails,status')
  vu.searchParams.set('id', ids.join(','))
  vu.searchParams.set('key', KEY)
  const vr = await fetch(vu.toString())
  const vd = vr.ok ? await vr.json() : { items: [] }
  const durById: Record<string, number> = {}
  const playableById: Record<string, boolean> = {}
  for (const it of vd.items || []) {
    durById[it.id] = isoToSec(it.contentDetails?.duration)
    // Drop videos the owner blocked from embedding or that aren't public — these
    // pass the search flag but still fail to play on the tablet.
    playableById[it.id] = it.status?.embeddable !== false && it.status?.privacyStatus === 'public'
  }

  const results = (sd.items || [])
    .filter((i: any) => i.id?.videoId)
    .map((i: any) => ({
      source: 'youtube',
      external_id: i.id.videoId,
      title: i.snippet?.title || 'Untitled',
      artist: i.snippet?.channelTitle || '',
      thumbnail: i.snippet?.thumbnails?.medium?.url || i.snippet?.thumbnails?.default?.url || null,
      duration: durById[i.id.videoId] ?? null,
    }))
    .filter((r: any) => !r.duration || r.duration <= 900)
    // Keep unknowns (details call may have been skipped), drop known-unplayable.
    .filter((r: any) => playableById[r.external_id] !== false)
  return { results }
}

export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim().slice(0, 120)
  const slug = (req.nextUrl.searchParams.get('zone') || '').trim()
  if (!q) return NextResponse.json({ results: [] })

  // Which source is this zone on?
  let source = 'youtube'
  if (slug) {
    const { data: zone } = await supabaseAdmin().from('jukebox_zones').select('source').eq('slug', slug).maybeSingle()
    if (zone?.source) source = zone.source
  }

  try {
    if (source === 'spotify') {
      const r = await spotifySearch(q)
      if (r.error) return NextResponse.json({ error: r.error === 'not-configured' ? 'Spotify search is not configured.' : 'Spotify search unavailable.', results: [] }, { status: 503 })
      return NextResponse.json({ results: r.results })
    }
    return NextResponse.json(await youtubeSearch(q))
  } catch {
    return NextResponse.json({ error: 'Search unavailable.', results: [] }, { status: 502 })
  }
}
