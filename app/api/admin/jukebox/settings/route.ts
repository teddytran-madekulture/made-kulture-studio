// POST /api/admin/jukebox/settings { zone, is_open?, source?, house_playlist_url?, explicit_filter?, name? }
// Per-zone jukebox settings.

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }) }

  const slug = String(b?.zone ?? '').trim()
  if (!slug) return NextResponse.json({ error: 'Missing zone.' }, { status: 400 })

  const updates: Record<string, any> = {}
  if (typeof b.is_open === 'boolean') updates.is_open = b.is_open
  if (typeof b.explicit_filter === 'boolean') updates.explicit_filter = b.explicit_filter
  if (b.source === 'youtube' || b.source === 'spotify') updates.source = b.source
  if (typeof b.house_playlist_url === 'string') updates.house_playlist_url = b.house_playlist_url.trim() || null
  if (typeof b.name === 'string' && b.name.trim()) updates.name = b.name.trim().slice(0, 60)
  if (!Object.keys(updates).length) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })

  const { error } = await supabaseAdmin().from('jukebox_zones').update(updates).eq('slug', slug)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
