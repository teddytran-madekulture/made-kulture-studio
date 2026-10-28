// POST /api/jukebox/volume-ack { zone, key, volume }
// The player reports the level it is ACTUALLY playing at, after applying a
// change (2026-10-27). Admin shows this as the confirmation ("playing at 60 ✓"),
// so a slider move is never a guess. Wall-tablet key required (player or kiosk),
// and only volume numbers are written. Called only when the volume changes.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { playerKeyOk } from '@/lib/jukebox-volume'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function POST(req: NextRequest) {
  let b: any = {}
  try { b = await req.json() } catch {}
  if (!playerKeyOk(b?.key)) return NextResponse.json({ error: 'Unauthorized player.' }, { status: 401 })
  const slug = String(b?.zone ?? '').trim()
  const n = Number(b?.volume)
  if (!slug || !Number.isFinite(n)) return NextResponse.json({ error: 'Missing zone or volume.' }, { status: 400 })
  const reported_volume = Math.max(0, Math.min(100, Math.round(n)))
  const { error } = await supabaseAdmin().from('jukebox_live')
    .upsert({ slug, reported_volume, reported_at: new Date().toISOString() }, { onConflict: 'slug' })
  if (error) { console.error('[volume-ack] write failed', error); return NextResponse.json({ error: error.message }, { status: 500 }) }
  return NextResponse.json({ ok: true })
}
