// POST /api/jukebox/house-now { zone, key?, title, artist }
// The player device reports the house-playlist track it is actually playing so
// the admin console can show the real song under NOW PLAYING (the server
// otherwise only knows the zone is in "house" mode, not which track). Called by
// the player when the track changes and as a light heartbeat. Optionally gated
// by JUKEBOX_PLAYER_KEY, like /api/jukebox/advance.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

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
  if (!slug) return NextResponse.json({ error: 'Missing zone.' }, { status: 400 })

  const title  = (typeof b?.title  === 'string' ? b.title  : '').trim().slice(0, 300)
  const artist = (typeof b?.artist === 'string' ? b.artist : '').trim().slice(0, 300)

  await supabaseAdmin().from('jukebox_zones').update({
    house_now_title:  title  || null,
    house_now_artist: artist || null,
    house_now_at:     new Date().toISOString(),
  }).eq('slug', slug)

  return NextResponse.json({ ok: true })
}
