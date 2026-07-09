// GET /api/jukebox/search?q=...&zone=slug — proxy YouTube search (key stays
// server-side). Returns up to 10 music results with duration. Called on submit /
// debounced by the client, never per keystroke (YouTube quota: search = 100
// units, default 10k/day ≈ 100 searches/day).

import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const KEY = process.env.YOUTUBE_API_KEY

// ISO 8601 duration (PT3M14S) → seconds
function isoToSec(iso: string): number {
  const m = /PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/.exec(iso || '')
  if (!m) return 0
  return (+(m[1] || 0)) * 3600 + (+(m[2] || 0)) * 60 + (+(m[3] || 0))
}

export async function GET(req: NextRequest) {
  if (!KEY) return NextResponse.json({ error: 'Search is not configured yet.', results: [] }, { status: 503 })

  const q = (req.nextUrl.searchParams.get('q') || '').trim().slice(0, 120)
  if (!q) return NextResponse.json({ results: [] })

  try {
    // 1) Search (music category, top 10, moderate safe-search).
    const su = new URL('https://www.googleapis.com/youtube/v3/search')
    su.searchParams.set('part', 'snippet')
    su.searchParams.set('q', q)
    su.searchParams.set('type', 'video')
    su.searchParams.set('videoCategoryId', '10')     // Music
    su.searchParams.set('videoEmbeddable', 'true')   // only embeddable videos
    su.searchParams.set('safeSearch', 'moderate')
    su.searchParams.set('maxResults', '10')
    su.searchParams.set('key', KEY)
    const sr = await fetch(su.toString())
    if (!sr.ok) return NextResponse.json({ error: 'Search unavailable.', results: [] }, { status: 502 })
    const sd = await sr.json()
    const ids: string[] = (sd.items || []).map((i: any) => i.id?.videoId).filter(Boolean)
    if (!ids.length) return NextResponse.json({ results: [] })

    // 2) One videos.list (1 unit) to get durations.
    const vu = new URL('https://www.googleapis.com/youtube/v3/videos')
    vu.searchParams.set('part', 'contentDetails')
    vu.searchParams.set('id', ids.join(','))
    vu.searchParams.set('key', KEY)
    const vr = await fetch(vu.toString())
    const vd = vr.ok ? await vr.json() : { items: [] }
    const durById: Record<string, number> = {}
    for (const it of vd.items || []) durById[it.id] = isoToSec(it.contentDetails?.duration)

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
      // Drop very long items (mixes/full albums) that clog a jukebox.
      .filter((r: any) => !r.duration || r.duration <= 900)

    return NextResponse.json({ results })
  } catch {
    return NextResponse.json({ error: 'Search unavailable.', results: [] }, { status: 502 })
  }
}
