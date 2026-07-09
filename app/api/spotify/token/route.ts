// GET /api/spotify/token?key=... — mints a short-lived Spotify access token for
// the laptop player (Web Playback SDK getOAuthToken + playback control). The
// refresh token and client secret never leave the server. Gated by
// JUKEBOX_PLAYER_KEY when set (recommended for the Spotify player).

import { NextRequest, NextResponse } from 'next/server'
import { getUserAccessToken } from '@/lib/spotify'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

function keyOk(key: string | null): boolean {
  const required = process.env.JUKEBOX_PLAYER_KEY
  if (!required) return true
  return key === required
}

export async function GET(req: NextRequest) {
  if (!keyOk(req.nextUrl.searchParams.get('key'))) {
    return NextResponse.json({ error: 'Unauthorized player.' }, { status: 401 })
  }
  const token = await getUserAccessToken()
  if (!token) return NextResponse.json({ error: 'Spotify not connected.' }, { status: 503 })
  return NextResponse.json({ access_token: token })
}
