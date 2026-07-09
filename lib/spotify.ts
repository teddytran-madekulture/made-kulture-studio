// Spotify integration for the jukebox.
//   • App token (client-credentials) — powers guest SEARCH, no user needed.
//   • User token (authorization-code + refresh) — powers PLAYBACK on the laptop
//     player. Only the refresh token is stored (spotify_auth); short-lived access
//     tokens are minted on demand. The studio's own account authorizes once.
//
// Env (Vercel): SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET
// Redirect URI is derived from the app URL and must match the Spotify dashboard.

import { createClient } from '@supabase/supabase-js'

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')

export const SPOTIFY_REDIRECT_URI = `${APP_URL}/api/spotify/callback`
export const SPOTIFY_SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-modify-playback-state',
  'user-read-playback-state',
].join(' ')

export function spotifyConfigured(): boolean {
  return !!CLIENT_ID && !!CLIENT_SECRET
}

function db() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
function basicAuth(): string {
  return 'Basic ' + Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')
}

// ── App token (client-credentials) for search ────────────────────────────────
let appTok: { token: string; exp: number } | null = null
export async function getAppToken(): Promise<string | null> {
  if (!spotifyConfigured()) return null
  if (appTok && appTok.exp > Date.now() + 30_000) return appTok.token
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'grant_type=client_credentials',
    cache: 'no-store',
  })
  if (!r.ok) return null
  const d = await r.json()
  appTok = { token: d.access_token, exp: Date.now() + (d.expires_in ?? 3600) * 1000 }
  return appTok.token
}

// ── OAuth (authorization-code) for playback ──────────────────────────────────
export function authorizeUrl(state: string): string {
  const u = new URL('https://accounts.spotify.com/authorize')
  u.searchParams.set('client_id', CLIENT_ID!)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set('redirect_uri', SPOTIFY_REDIRECT_URI)
  u.searchParams.set('scope', SPOTIFY_SCOPES)
  u.searchParams.set('state', state)
  return u.toString()
}

export async function exchangeCode(code: string): Promise<boolean> {
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'authorization_code', code, redirect_uri: SPOTIFY_REDIRECT_URI }),
    cache: 'no-store',
  })
  if (!r.ok) return false
  const d = await r.json()
  if (!d.refresh_token) return false

  let email: string | null = null
  try {
    const me = await fetch('https://api.spotify.com/v1/me', { headers: { Authorization: `Bearer ${d.access_token}` }, cache: 'no-store' })
    if (me.ok) email = (await me.json())?.email ?? null
  } catch {}

  await db().from('spotify_auth').upsert({
    id: 1, refresh_token: d.refresh_token, scope: d.scope ?? SPOTIFY_SCOPES,
    connected_email: email, updated_at: new Date().toISOString(),
  }, { onConflict: 'id' })
  userTok = null
  return true
}

export async function isConnected(): Promise<{ connected: boolean; email?: string | null }> {
  const { data } = await db().from('spotify_auth').select('refresh_token, connected_email').eq('id', 1).maybeSingle()
  return { connected: !!data?.refresh_token, email: data?.connected_email }
}

export async function disconnect(): Promise<void> {
  await db().from('spotify_auth').update({ refresh_token: null, connected_email: null, updated_at: new Date().toISOString() }).eq('id', 1)
  userTok = null
}

// ── User access token (refreshed from the stored refresh token) ──────────────
let userTok: { token: string; exp: number } | null = null
export async function getUserAccessToken(): Promise<string | null> {
  if (!spotifyConfigured()) return null
  if (userTok && userTok.exp > Date.now() + 30_000) return userTok.token
  const { data } = await db().from('spotify_auth').select('refresh_token').eq('id', 1).maybeSingle()
  const refresh = data?.refresh_token
  if (!refresh) return null
  const r = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refresh }),
    cache: 'no-store',
  })
  if (!r.ok) return null
  const d = await r.json()
  userTok = { token: d.access_token, exp: Date.now() + (d.expires_in ?? 3600) * 1000 }
  // Spotify occasionally rotates the refresh token.
  if (d.refresh_token && d.refresh_token !== refresh) {
    await db().from('spotify_auth').update({ refresh_token: d.refresh_token, updated_at: new Date().toISOString() }).eq('id', 1)
  }
  return userTok.token
}

// ── Search ───────────────────────────────────────────────────────────────────
export async function searchTracks(q: string) {
  const token = await getAppToken()
  if (!token) return { error: 'not-configured', results: [] as any[] }
  const u = new URL('https://api.spotify.com/v1/search')
  u.searchParams.set('q', q)
  u.searchParams.set('type', 'track')
  u.searchParams.set('limit', '10')
  const r = await fetch(u.toString(), { headers: { Authorization: `Bearer ${token}` }, cache: 'no-store' })
  if (!r.ok) return { error: 'search-failed', results: [] as any[] }
  const d = await r.json()
  const results = (d.tracks?.items ?? []).map((t: any) => ({
    source: 'spotify',
    external_id: t.id,                       // playback uses spotify:track:<id>
    title: t.name,
    artist: (t.artists ?? []).map((a: any) => a.name).join(', '),
    thumbnail: t.album?.images?.[t.album.images.length - 1]?.url || t.album?.images?.[0]?.url || null,
    duration: t.duration_ms ? Math.round(t.duration_ms / 1000) : null,
    explicit: !!t.explicit,
  }))
  return { results }
}
