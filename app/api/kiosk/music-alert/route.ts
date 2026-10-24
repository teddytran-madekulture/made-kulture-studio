// POST /api/kiosk/music-alert { key, set, zone }
// The music host (/kiosk/host) calls this when the studio music has sat MUTED
// waiting for a tap for 90s+ during studio hours — which happens after the
// tablet itself reloads, reboots or loses power (Android WebView only lets
// YouTube start muted). Without it the room just goes quiet and nobody knows.
// One push per zone per 30 minutes, tagged so a repeat replaces the last one.
import { NextRequest, NextResponse } from 'next/server'
import { kioskKeyOk } from '@/lib/kiosk-staff-pin'
import { rateLimit } from '@/lib/rate-limit'
import { sendOwnerPush } from '@/lib/push'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const SLUG_RE = /^[a-z0-9-]{2,40}$/

export async function POST(req: NextRequest) {
  let b: any = {}
  try { b = await req.json() } catch {}
  if (!kioskKeyOk(b?.key ?? null)) return NextResponse.json({ error: 'Unauthorized kiosk' }, { status: 401 })
  const set = String(b?.set ?? '').trim()
  const zone = String(b?.zone ?? '').trim()
  if (!SLUG_RE.test(set) || !SLUG_RE.test(zone)) return NextResponse.json({ error: 'Bad set or zone.' }, { status: 400 })

  const rl = await rateLimit(`music-muted:${zone}`, 1, 30 * 60_000)
  if (!rl.allowed) return NextResponse.json({ ok: true, sent: false })

  const tablet = set.replace(/-/g, ' ').toUpperCase()
  await sendOwnerPush({
    title: 'Studio music is silent',
    body: `The ${tablet} tablet restarted and the music is waiting for a tap. Tap the tablet screen to start it.`,
    url: '/admin/jukebox',
    tag: `music-muted-${zone}`,
  })
  return NextResponse.json({ ok: true, sent: true })
}
