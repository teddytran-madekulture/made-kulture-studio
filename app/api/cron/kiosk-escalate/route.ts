import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendOwnerPush } from '@/lib/push'

// GET /api/cron/kiosk-escalate  (pg_cron, every minute)
// Re-pushes Teddy about an active kiosk ring until he opens the admin (which
// pings /api/admin/kiosk-ack). Stops on acknowledgement or after the window,
// so a missed ring keeps buzzing instead of a single easy-to-miss banner.

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MIN_AGE_MS = 45 * 1000            // skip the minute right after summon (it already pushed)
const WINDOW_MS  = 6 * 60 * 1000        // give up re-pushing after 6 minutes

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data } = await supabase
    .from('studio_settings')
    .select('key, value')
    .in('key', ['kiosk_summon_at', 'kiosk_summon_ack_at'])
  const map: Record<string, string> = {}
  for (const r of data ?? []) map[r.key] = r.value

  const summonAt = map['kiosk_summon_at'] ? new Date(map['kiosk_summon_at']).getTime() : 0
  const ackAt    = map['kiosk_summon_ack_at'] ? new Date(map['kiosk_summon_ack_at']).getTime() : 0
  if (!summonAt) return NextResponse.json({ escalated: false, reason: 'no ring' })

  const acknowledged = ackAt >= summonAt
  const age = Date.now() - summonAt
  if (acknowledged) return NextResponse.json({ escalated: false, reason: 'acknowledged' })
  if (age < MIN_AGE_MS) return NextResponse.json({ escalated: false, reason: 'too soon' })
  if (age > WINDOW_MS)  return NextResponse.json({ escalated: false, reason: 'window elapsed' })

  const mins = Math.round(age / 60000)
  await sendOwnerPush({
    title: '🛎️ STILL WAITING at the kiosk',
    body: `A guest tapped "Get the team" ${mins} min ago and no one has responded. Open the admin to clear this.`,
    url: '/admin/inbox',
    tag: 'kiosk-summon',
    renotify: true,
    requireInteraction: true,
  }).catch(e => console.error('[kiosk escalate] push error:', e))

  return NextResponse.json({ escalated: true, ageMs: age })
}
