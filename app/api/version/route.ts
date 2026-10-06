// GET /api/version — what build is actually deployed right now.
//
// Three readers, three fields — keep ALL of them:
//   build       — short git SHA. The admin PWA's stale-build guard (components/AdminPwa).
//   version     — full git SHA. The check-in kiosks reload on it (when idle on HOME).
//   player_rev  — hand-bumped in lib/player-rev.ts, only when a deploy changes what
//                 the jukebox player runs. Music devices watch this so unrelated
//                 deploys never stop the music.
//   reload_at   — Admin → Jukebox "Update players now". Music devices reload on it.
//
// ⚠️ 2026-10-05: on 2026-08-13 this route was rewritten to return ONLY `build`,
// which silently switched off kiosk self-update and the "Update players now"
// button for seven weeks — every reader got `undefined` and quietly returned.
// Removing a field here breaks a wall tablet nobody is watching.

import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { JUKEBOX_PLAYER_REV, PLAYER_RELOAD_KEY } from '@/lib/player-rev'

export const dynamic = 'force-dynamic'
export const revalidate = 0
export const fetchCache = 'force-no-store'

export async function GET() {
  const sha = process.env.VERCEL_GIT_COMMIT_SHA || process.env.VERCEL_DEPLOYMENT_ID || 'dev'

  let reload_at: string | null = null
  try {
    const { data } = await supabaseAdmin()
      .from('studio_settings').select('value').eq('key', PLAYER_RELOAD_KEY).maybeSingle()
    reload_at = (data as any)?.value ?? null
  } catch {}

  return NextResponse.json(
    { build: sha === 'dev' ? 'dev' : sha.slice(0, 12), version: sha, player_rev: JUKEBOX_PLAYER_REV, reload_at },
    { headers: { 'Cache-Control': 'no-store, must-revalidate' } },
  )
}
