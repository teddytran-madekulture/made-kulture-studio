// POST /api/jukebox/request
// { zone, source, external_id, title, artist?, thumbnail?, duration?, device, name? }
// Anyone can request; nothing plays until Teddy approves. Guardrails: zone must
// be open, one pending request per device, best-effort explicit-title block.
// Pings Teddy via web push.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendOwnerPush } from '@/lib/push'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Best-effort explicit filter (YouTube has no reliable explicit flag).
const BLOCKLIST = ['fuck', 'shit', 'nigga', 'nigger', 'cunt', 'bitch', 'pussy', 'dick', 'cum', 'porn', 'xxx']
function looksExplicit(title: string): boolean {
  const t = ` ${title.toLowerCase()} `
  return BLOCKLIST.some(w => t.includes(` ${w} `) || t.includes(`${w} `) || t.includes(` ${w}`))
}

// Per-IP rate limit (6 / minute) as a coarse backstop on top of the per-device
// pending cap enforced in the DB.
const hits = new Map<string, number[]>()
function limited(ip: string): boolean {
  const now = Date.now()
  const arr = (hits.get(ip) ?? []).filter(t => now - t < 60_000)
  if (arr.length >= 6) { hits.set(ip, arr); return true }
  arr.push(now); hits.set(ip, arr); return false
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown'
  if (limited(ip)) return NextResponse.json({ error: 'Slow down a sec — try again in a moment.' }, { status: 429 })

  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }) }

  const zoneSlug = String(b?.zone ?? '').trim()
  const external_id = String(b?.external_id ?? '').trim().slice(0, 64)
  const title = String(b?.title ?? '').trim().slice(0, 200)
  const artist = String(b?.artist ?? '').trim().slice(0, 120) || null
  const thumbnail = String(b?.thumbnail ?? '').trim().slice(0, 400) || null
  const device = String(b?.device ?? '').trim().slice(0, 80) || null
  const name = String(b?.name ?? '').trim().slice(0, 40) || null
  const duration = Number.isFinite(+b?.duration) ? Math.max(0, Math.round(+b.duration)) : null
  const source = b?.source === 'spotify' ? 'spotify' : 'youtube'

  if (!zoneSlug || !external_id || !title) {
    return NextResponse.json({ error: 'Pick a song first.' }, { status: 400 })
  }

  const { data: zone } = await supabase
    .from('jukebox_zones')
    .select('id, name, is_open, explicit_filter, auto_approve')
    .eq('slug', zoneSlug).single()
  if (!zone) return NextResponse.json({ error: 'Unknown area.' }, { status: 404 })
  if (!zone.is_open) return NextResponse.json({ error: 'The jukebox is paused right now.' }, { status: 409 })

  // Spotify sends a real `explicit` flag; YouTube falls back to a title blocklist.
  const explicitFlag = b?.explicit === true
  if (zone.explicit_filter && (explicitFlag || looksExplicit(title))) {
    return NextResponse.json({ error: "That track is marked explicit — it can't be added to the shared queue." }, { status: 422 })
  }

  const autoApprove = !!zone.auto_approve

  // Cap un-played requests per device (stops one phone flooding the queue).
  if (device) {
    const statuses = autoApprove ? ['pending', 'approved', 'playing'] : ['pending']
    const limit = autoApprove ? 3 : 1
    const { count } = await supabase
      .from('jukebox_requests')
      .select('id', { count: 'exact', head: true })
      .eq('zone_id', zone.id).eq('requester_device', device).in('status', statuses)
    if ((count ?? 0) >= limit) {
      return NextResponse.json({
        error: autoApprove
          ? "You've got a few songs in the queue already — give them a sec to play."
          : "You've already got a song waiting — hang tight until it's reviewed.",
      }, { status: 409 })
    }
  }

  const { data: created, error } = await supabase
    .from('jukebox_requests')
    .insert({
      zone_id: zone.id, source, external_id, title, artist,
      thumbnail_url: thumbnail, duration_sec: duration,
      requester_device: device, requester_name: name,
      status: autoApprove ? 'approved' : 'pending',
      approved_at: autoApprove ? new Date().toISOString() : null,
    })
    .select('id').single()
  if (error || !created) return NextResponse.json({ error: 'Could not add your song — try again.' }, { status: 500 })

  // In auto-approve mode Teddy doesn't need to act, so skip the push.
  if (!autoApprove) {
    await sendOwnerPush({
      title: '🎵 Song request',
      body: `${zone.name}: "${title}"${artist ? ` — ${artist}` : ''}${name ? ` (from ${name})` : ''}`,
      url: `/admin/jukebox?zone=${zoneSlug}`,
      tag: `jukebox-${zone.id}`,
      renotify: true,
    }).catch(e => console.error('[jukebox] owner push (non-fatal):', e))
  }

  return NextResponse.json({
    success: true,
    id: created.id,
    message: autoApprove ? 'Added to the queue! 🎶' : 'Added! The team will approve it shortly.',
  })
}
