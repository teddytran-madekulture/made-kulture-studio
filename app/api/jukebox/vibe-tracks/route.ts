// POST /api/jukebox/vibe-tracks { zone, key }
// Keep the vibe going on a SPOTIFY zone (2026-10-24). The player calls this
// when the zone is in a vibe; returns the Spotify track ids to play, built from
// the seed song's artist via ListenBrainz radio (lib/spotify-vibe.ts).
// YouTube zones never call it — they play YouTube's own Mix.
// Same player-key gate as /api/jukebox/advance.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { readVibe } from '@/lib/jukebox'
import { buildSpotifyVibe } from '@/lib/spotify-vibe'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const maxDuration = 30

function keyOk(key: unknown): boolean {
  const required = process.env.JUKEBOX_PLAYER_KEY
  if (!required) { console.error('[auth] key env var is not set — refusing'); return false }
  if (typeof key !== 'string' || !key) return false
  return key === required || (!!process.env.KIOSK_KEY && key === process.env.KIOSK_KEY)
}

export async function POST(req: NextRequest) {
  let b: any = {}
  try { b = await req.json() } catch {}
  if (!keyOk(b?.key)) return NextResponse.json({ error: 'Unauthorized player.' }, { status: 401 })
  const slug = String(b?.zone ?? '').trim()
  if (!slug) return NextResponse.json({ error: 'Missing zone.' }, { status: 400 })

  const db = supabaseAdmin()
  const { data: zone, error } = await db.from('jukebox_zones')
    .select('id, source, vibe_enabled, vibe_seed_id, vibe_seed_title, vibe_until').eq('slug', slug).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!zone) return NextResponse.json({ error: 'Unknown zone.' }, { status: 404 })
  const { vibe } = readVibe(zone as any)
  if (!vibe || (zone as any).source !== 'spotify') return NextResponse.json({ ids: [], via: 'none' })

  // The seed's artist lives on the request row it came from.
  const { data: req0 } = await db.from('jukebox_requests')
    .select('title, artist').eq('zone_id', (zone as any).id).eq('external_id', vibe.seed_id)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  const out = await buildSpotifyVibe({ id: vibe.seed_id, title: req0?.title ?? vibe.seed_title, artist: req0?.artist ?? null })
  console.log(`[vibe] spotify zone ${slug}: ${out.ids.length} tracks via ${out.via} (seed ${req0?.artist ?? '?'} - ${req0?.title ?? vibe.seed_title ?? '?'})`)
  return NextResponse.json(out)
}
