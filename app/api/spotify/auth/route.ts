// GET /api/spotify/auth — admin kicks off the Spotify OAuth connect. Sets a
// signed state cookie and redirects to Spotify's authorize page.

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { isAdminAuthed } from '@/lib/admin-auth'
import { authorizeUrl, spotifyConfigured } from '@/lib/spotify'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!spotifyConfigured()) return NextResponse.json({ error: 'Spotify is not configured (missing client id/secret).' }, { status: 503 })

  const state = randomUUID().replace(/-/g, '')
  const res = NextResponse.redirect(authorizeUrl(state))
  res.cookies.set('spotify_oauth_state', state, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 600, path: '/',
  })
  return res
}
