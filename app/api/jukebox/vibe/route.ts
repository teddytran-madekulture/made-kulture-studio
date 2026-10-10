// POST /api/jukebox/vibe { zone, action: 'end' }
// The guest page's "Back to house music" button (2026-10-10). Ends the zone's
// "keep the vibe going" Mix right away — the player switches to the house
// playlist on its next poll (≤15s). Public on purpose, like the request page:
// it can only ever make the room play the house playlist sooner.
// The admin console uses /api/admin/jukebox/control { action: 'end_vibe' }.

import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { rateLimit, clientIp } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function POST(req: NextRequest) {
  let b: any = {}
  try { b = await req.json() } catch {}
  const slug = String(b?.zone ?? '').trim()
  if (!slug) return NextResponse.json({ error: 'Missing zone.' }, { status: 400 })
  if (b?.action !== 'end') return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })

  const rl = await rateLimit(`jukebox-vibe:${clientIp(req)}`, 10, 60_000, { failOpen: true })
  if (!rl.allowed) return NextResponse.json({ error: 'Slow down a sec.' }, { status: 429 })

  // .select() back: an update matching nothing is not an error in supabase-js.
  const { data, error } = await supabaseAdmin().from('jukebox_zones')
    .update({ vibe_seed_id: null, vibe_seed_title: null, vibe_until: null })
    .eq('slug', slug).select('id')
  if (error) { console.error('[jukebox/vibe] end failed:', error.message); return NextResponse.json({ error: 'Could not reach the jukebox.' }, { status: 500 }) }
  if (!data?.length) return NextResponse.json({ error: 'Unknown zone.' }, { status: 404 })
  return NextResponse.json({ success: true, message: 'Back to the house playlist.' })
}
