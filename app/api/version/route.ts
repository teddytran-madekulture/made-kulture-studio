import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { JUKEBOX_PLAYER_REV, PLAYER_RELOAD_KEY } from '@/lib/player-rev'

// Build-identity endpoint the in-studio devices poll to decide whether to
// reload themselves.
//
//   version     — git commit SHA, changes on EVERY deploy. The check-in kiosk
//                 watches this; it's fine for it to refresh whenever we ship.
//   player_rev  — hand-bumped in lib/player-rev.ts, and ONLY when a deploy
//                 changes what the jukebox player runs. The music tablets watch
//                 this, so shipping unrelated work no longer stops the music.
//   reload_at   — set by Admin → Jukebox "Update players now". A change here
//                 tells the tablets to reload immediately, song or no song.
export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET() {
  const version =
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.VERCEL_DEPLOYMENT_ID ||
    'dev'

  let reload_at: string | null = null
  try {
    const { data } = await supabaseAdmin()
      .from('studio_settings').select('value').eq('key', PLAYER_RELOAD_KEY).maybeSingle()
    reload_at = (data as any)?.value ?? null
  } catch {}

  return NextResponse.json(
    { version, player_rev: JUKEBOX_PLAYER_REV, reload_at },
    { headers: { 'Cache-Control': 'no-store, must-revalidate' } },
  )
}
