// GET /api/spotify/callback — Spotify redirects here after the studio authorizes.
// Verifies the state cookie, exchanges the code for tokens (storing the refresh
// token), and bounces back to the admin jukebox page.

import { NextRequest, NextResponse } from 'next/server'
import { exchangeCode } from '@/lib/spotify'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')

export async function GET(req: NextRequest) {
  const url = req.nextUrl
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const err = url.searchParams.get('error')
  const cookieState = req.cookies.get('spotify_oauth_state')?.value

  const back = (status: string) => NextResponse.redirect(`${APP_URL}/admin/jukebox?spotify=${status}`)

  if (err) return back('denied')
  if (!code || !state || !cookieState || state !== cookieState) return back('badstate')

  const ok = await exchangeCode(code)
  const res = back(ok ? 'connected' : 'failed')
  res.cookies.set('spotify_oauth_state', '', { maxAge: 0, path: '/' })
  return res
}
