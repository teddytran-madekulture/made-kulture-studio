// POST /api/kiosk/jukebox { set, key, pin, zone, action }
// The MUSIC button on a kiosk tablet (2026-10-05). Same door as STAFF: the
// kiosk key gets you to it, a staff PIN opens it (lib/kiosk-staff-pin — shared
// lockout). The PIN is sent with every action; nothing is remembered server-side.
//   verify — just check the PIN (opens the panel)
//   pause | play — freeze / resume the zone (the player reacts on its next poll)
//   next   — skip the GUEST REQUEST that's playing. Skipping within the house
//            playlist happens on the tablet itself (the server doesn't own it).
// Mirrors /api/admin/jukebox/control for these three actions.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { checkKioskStaffPin, kioskKeyOk, pinFailed } from '@/lib/kiosk-staff-pin'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function POST(req: NextRequest) {
  let b: any = {}
  try { b = await req.json() } catch {}
  if (!kioskKeyOk(b?.key ?? null)) return NextResponse.json({ error: 'Unauthorized kiosk' }, { status: 401 })
  const set = String(b?.set ?? '').trim()
  const zoneSlug = String(b?.zone ?? '').trim()
  const action = String(b?.action ?? '')
  if (!set || !zoneSlug) return NextResponse.json({ error: 'Missing set or zone.' }, { status: 400 })
  if (!['verify', 'pause', 'play', 'next'].includes(action)) return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })

  const db = supabaseAdmin()
  const pin = await checkKioskStaffPin(db, b?.pin, set)
  if (pinFailed(pin)) return NextResponse.json({ error: pin.error }, { status: pin.status })

  const { data: zone } = await db.from('jukebox_zones').select('id, now_playing_id').eq('slug', zoneSlug).maybeSingle()
  if (!zone) return NextResponse.json({ error: 'Unknown music zone.' }, { status: 404 })

  if (action === 'verify') return NextResponse.json({ ok: true, staff: (pin as any).staffName })

  if (action === 'pause' || action === 'play') {
    const { data, error } = await db.from('jukebox_zones').update({ paused: action === 'pause' }).eq('id', zone.id).select('id')
    if (error || !data?.length) return NextResponse.json({ error: error?.message || 'Could not update the music.' }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // next — only meaningful while a guest request is playing.
  if (!zone.now_playing_id) return NextResponse.json({ ok: true, house: true })
  const now = new Date().toISOString()
  await db.from('jukebox_requests').update({ status: 'skipped', played_at: now }).eq('id', zone.now_playing_id).eq('status', 'playing')
  const { data, error } = await db.from('jukebox_zones').update({ now_playing_id: null, paused: false }).eq('id', zone.id).select('id')
  if (error || !data?.length) return NextResponse.json({ error: error?.message || 'Could not skip.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
