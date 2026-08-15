import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendOwnerPush } from '@/lib/push'

// GET /api/cron/kiosk-escalate  (pg_cron, every minute)
//
// Re-pushes Teddy about an unanswered kiosk ring. Stops on acknowledgement or
// after the window, so a missed ring keeps buzzing instead of a single
// easy-to-miss banner.
//
// ⚠️ WHAT "ACKNOWLEDGED" MEANS CHANGED. It used to mean "the admin app became
// visible" — which merely opening the admin satisfied, so a ring could be
// silently marked answered by someone who never saw it and wasn't coming. It
// now means Teddy tapped ON MY WAY, in the banner or on the notification. The
// guest's tablet is polling the same flag, so this and their screen can never
// disagree about whether help is coming.

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const MIN_AGE_MS = 45 * 1000            // skip the minute right after summon (it already pushed)
const WINDOW_MS  = 6 * 60 * 1000        // give up re-pushing after 6 minutes
const QUIET_MS   = 3 * 60 * 1000        // past this the tablet has shown them the studio number

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('studio_settings')
    .select('key, value')
    .in('key', ['kiosk_summon_at', 'kiosk_summon_ack_at', 'kiosk_summon_set'])
  if (error) {
    console.error('[kiosk escalate] read error:', error)
    return NextResponse.json({ escalated: false, error: error.message }, { status: 500 })
  }
  const map: Record<string, string> = {}
  for (const r of data ?? []) map[r.key] = r.value

  // Parsed instants, never string compares — the same moment can be spelled
  // '+00:00' or '-05:00' and a lexical compare gets the order wrong.
  const summonAt = map['kiosk_summon_at'] ? Date.parse(map['kiosk_summon_at']) : 0
  const ackAt    = map['kiosk_summon_ack_at'] ? Date.parse(map['kiosk_summon_ack_at']) : 0
  const place    = map['kiosk_summon_set'] || 'the kiosk'
  if (!summonAt) return NextResponse.json({ escalated: false, reason: 'no ring' })

  const acknowledged = ackAt >= summonAt
  const age = Date.now() - summonAt
  if (acknowledged) return NextResponse.json({ escalated: false, reason: 'acknowledged' })
  if (age < MIN_AGE_MS) return NextResponse.json({ escalated: false, reason: 'too soon' })
  if (age > WINDOW_MS)  return NextResponse.json({ escalated: false, reason: 'window elapsed' })

  const mins = Math.max(1, Math.round(age / 60000))
  const quiet = age >= QUIET_MS

  await sendOwnerPush({
    title: quiet ? `🛎️ STILL WAITING at ${place}` : `🛎️ ${place} — nobody has answered`,
    body: quiet
      ? `${mins} min with no answer. Their tablet has stopped saying anyone is coming and has given them the studio number.`
      : `Someone tapped "Get the team" ${mins} min ago. Tap ON MY WAY so their tablet can tell them.`,
    url: '/admin/inbox',
    tag: 'kiosk-summon',
    renotify: true,
    requireInteraction: true,
    meta: { place },
  }).catch(e => console.error('[kiosk escalate] push error:', e))

  return NextResponse.json({ escalated: true, ageMs: age, place, quiet })
}
