// KEEP THE VIBE GOING — Spotify zones (2026-10-24).
//
// YouTube zones get "similar songs" for free (YouTube's own Mix, list=RD<id>).
// Spotify removed song recommendations and related artists from its developer
// API in Nov 2024 (and artist top tracks in Feb 2026), so a Spotify zone asks
// ListenBrainz (MetaBrainz, a nonprofit; openly licensed data) for a radio
// playlist built from the seed's ARTIST, then finds each suggestion on Spotify
// with the ordinary search the guest page already uses. Spotify still plays
// everything — ListenBrainz only picks the titles.
//
// Fallback: an artist ListenBrainz doesn't know (brand-new, local) gets more of
// that same artist from Spotify search, so the room never goes straight to
// silence.
//
// Env: LISTENBRAINZ_TOKEN — REQUIRED. Checked 2026-10-24: the radio endpoint
// now returns 401 without one ("bad actors and AI scrapers"). Without the token
// every vibe falls back to more-from-the-same-artist, and the log says so.
import { searchTracks } from '@/lib/spotify'
import { MAX_REQUEST_SECONDS } from '@/lib/jukebox'

const LB_RADIO = 'https://api.listenbrainz.org/1/explore/lb-radio'
const TARGET = 12          // ~40 min of music for a 30-minute window
const CANDIDATES = 24      // suggestions we try to find on Spotify
const BATCH = 6            // parallel Spotify searches at a time

type Suggestion = { title: string; artist: string }

/** First credited artist, cleaned for an LB Radio prompt / Spotify query. */
export function leadArtist(artist: string | null | undefined): string {
  return String(artist || '').split(/,|&| feat\.? | ft\.? /i)[0].replace(/[()"]/g, '').trim()
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p, new Promise<null>(r => setTimeout(() => r(null), ms))])
}

export async function listenBrainzRadio(artist: string): Promise<Suggestion[]> {
  if (!artist) return []
  if (!process.env.LISTENBRAINZ_TOKEN) { console.warn('[vibe] LISTENBRAINZ_TOKEN is not set - using same-artist fallback'); return [] }
  const u = new URL(LB_RADIO)
  u.searchParams.set('prompt', `artist:(${artist})`)
  u.searchParams.set('mode', 'easy')
  const headers: Record<string, string> = { Accept: 'application/json', Authorization: `Token ${process.env.LISTENBRAINZ_TOKEN}` }
  try {
    const r = await withTimeout(fetch(u.toString(), { headers, cache: 'no-store' }), 9000)
    if (!r) { console.warn('[vibe] ListenBrainz timed out for', artist); return [] }
    if (!r.ok) { console.warn('[vibe] ListenBrainz', r.status, 'for', artist); return [] }
    const d = await r.json()
    const tracks: any[] = d?.payload?.jspf?.playlist?.track ?? []
    return tracks
      .map(t => ({ title: String(t?.title || '').trim(), artist: String(t?.creator || '').trim() }))
      .filter(t => t.title && t.artist)
  } catch (e: any) {
    console.warn('[vibe] ListenBrainz failed for', artist, e?.message)
    return []
  }
}

const clean = (s: string) => s.replace(/["]/g, '').trim()
const playable = (x: any) => x?.external_id && !(typeof x.duration === 'number' && x.duration > MAX_REQUEST_SECONDS)

/**
 * Spotify track ids to play after the seed. Never includes the seed, never
 * repeats, never a track over the 15-minute request cap. May be empty.
 */
export async function buildSpotifyVibe(seed: { id: string; title?: string | null; artist?: string | null }): Promise<{ ids: string[]; via: 'listenbrainz' | 'artist' | 'none' }> {
  const artist = leadArtist(seed.artist)
  const seen = new Set<string>([seed.id])
  const titlesSeen = new Set<string>()
  if (seed.title) titlesSeen.add(`${clean(seed.title).toLowerCase()}|${artist.toLowerCase()}`)
  const ids: string[] = []

  const suggestions = (await listenBrainzRadio(artist)).slice(0, CANDIDATES)
  for (let i = 0; i < suggestions.length && ids.length < TARGET; i += BATCH) {
    const batch = suggestions.slice(i, i + BATCH)
    const found = await Promise.all(batch.map(async s => {
      const key = `${clean(s.title).toLowerCase()}|${leadArtist(s.artist).toLowerCase()}`
      if (titlesSeen.has(key)) return null
      titlesSeen.add(key)
      const r = await searchTracks(`track:"${clean(s.title)}" artist:"${clean(leadArtist(s.artist))}"`)
      return (r.results ?? []).find(playable) ?? null
    }))
    for (const f of found) {
      if (f && !seen.has(f.external_id) && ids.length < TARGET) { seen.add(f.external_id); ids.push(f.external_id) }
    }
  }
  if (ids.length >= 4) return { ids, via: 'listenbrainz' }

  // Fallback: more from the same artist.
  if (artist) {
    const r = await searchTracks(`artist:"${clean(artist)}"`)
    for (const f of (r.results ?? [])) {
      if (playable(f) && !seen.has(f.external_id) && ids.length < TARGET) { seen.add(f.external_id); ids.push(f.external_id) }
    }
  }
  return { ids, via: ids.length ? (suggestions.length ? 'listenbrainz' : 'artist') : 'none' }
}
