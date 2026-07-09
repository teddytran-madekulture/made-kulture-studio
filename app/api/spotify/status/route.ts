// GET  /api/spotify/status — admin: is the studio's Spotify connected?
// POST /api/spotify/status { action:'disconnect' } — admin: forget the token.

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { isConnected, disconnect, spotifyConfigured } from '@/lib/spotify'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { connected, email } = await isConnected()
  return NextResponse.json({ configured: spotifyConfigured(), connected, email })
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let b: any = {}
  try { b = await req.json() } catch {}
  if (b?.action === 'disconnect') { await disconnect(); return NextResponse.json({ success: true }) }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
