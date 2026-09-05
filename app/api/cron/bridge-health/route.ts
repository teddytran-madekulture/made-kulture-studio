// GET /api/cron/bridge-health — page Teddy when an igloohome Bridge has been
// down long enough to matter, and only when it actually matters.
//
// Why this is a cron and not a line in the webhook: the webhook is stateless and
// cannot wait to see whether a Bridge comes back. On 2026-09-04 the back-door
// Bridge dropped for 24 SECONDS. Alerting from the handler would have been an
// alert about nothing, and an alert you learn to ignore is worse than none.
//
// The rule, decided with Teddy 2026-09-04:
//   offline for >= 10 minutes  AND  a booking is running now or starts within 3h
// Silent overnight in an empty building; loud before somebody is standing at a
// door that cannot report their arrival.
//
// While a Bridge is down, that door's activity logs never reach us, so door-code
// check-in is blind and overtime does not accrue
// (app/admin/dashboard/page.tsx:410 — `if (!b.checked_in_at) return 0`).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendOwnerPush } from '@/lib/push'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

const OFFLINE_GRACE_MS = 10 * 60 * 1000  // blip filter — see the 24s outage above
const BOOKING_HORIZON_MS = 3 * 60 * 60 * 1000

// Central, not UTC. The server runs UTC and reading a raw timestamp lands on the
// wrong evening — and sometimes the wrong day.
function centralTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso))
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = Date.now()
  const cutoff = new Date(now - OFFLINE_GRACE_MS).toISOString()

  // Hot path: two-row table, indexed. Nothing else runs unless something is down.
  const { data: down, error: downErr } = await supabase
    .from('bridge_status')
    .select('device_id, label, changed_at, alerted_at')
    .eq('is_online', false)
    .lte('changed_at', cutoff)
    .is('alerted_at', null)
  if (downErr) {
    console.error('[bridge-health] bridge_status read failed:', downErr)
    return NextResponse.json({ error: 'read failed' }, { status: 500 })
  }
  if (!down?.length) return NextResponse.json({ ok: true, down: 0 })

  // Does anyone actually need the door soon?
  const horizon = new Date(now + BOOKING_HORIZON_MS).toISOString()
  const { data: soon, error: bookErr } = await supabase
    .from('bookings')
    .select('id, start_time, end_time')
    .neq('status', 'cancelled')
    .lte('start_time', horizon)
    .gte('end_time', new Date(now).toISOString())
    .order('start_time', { ascending: true })
    .limit(1)
  if (bookErr) {
    console.error('[bridge-health] bookings read failed:', bookErr)
    return NextResponse.json({ error: 'read failed' }, { status: 500 })
  }

  if (!soon?.length) {
    // Deliberately do NOT latch alerted_at. The Bridge stays flagged, so if it is
    // still down when the first booking of the morning comes into range, this
    // fires then. An overnight outage is not forgiven, just not shouted about.
    console.log(`[bridge-health] ${down.length} bridge(s) down but no booking within 3h — holding`)
    return NextResponse.json({ ok: true, down: down.length, alerted: 0, reason: 'no booking in window' })
  }

  // sendOwnerPush is fire-and-forget and returns void: with no subscriptions it
  // quietly does nothing. An alert about silent failure must not fail silently,
  // so check for a target FIRST and make "reached nobody" a loud, visible state.
  const { count: subCount, error: subErr } = await supabase
    .from('push_subscriptions')
    .select('id', { count: 'exact', head: true })
  if (subErr) console.error('[bridge-health] push_subscriptions count failed:', subErr)
  if (!subErr && (subCount ?? 0) === 0) {
    // Do NOT latch — nothing was delivered, so this must try again next tick.
    console.error(
      `[bridge-health] ${down.length} bridge(s) down and a session is due, but there are ZERO ` +
      `push subscriptions — NOBODY WAS ALERTED. Re-subscribe from the admin PWA.`
    )
    return NextResponse.json({ ok: false, down: down.length, alerted: 0, reason: 'no push subscriptions' })
  }

  const next = soon[0]
  let alerted = 0

  for (const b of down) {
    const mins = Math.round((now - new Date(b.changed_at).getTime()) / 60000)
    const who = b.label || b.device_id
    const title = `Door Bridge offline — ${who}`
    const body =
      `The ${who} Bridge has been offline ${mins} min. Door codes may still open the lock, ` +
      `but arrivals are not being recorded. Next session ${centralTime(next.start_time)}.`

    await sendOwnerPush({
      title,
      body,
      url: '/admin/dashboard?view=calendar&cal=agenda',
      tag: `bridge-${b.device_id}`,   // one notification per bridge, replaced not stacked
      renotify: true,
      requireInteraction: true,
      meta: { kind: 'bridge_offline', deviceId: b.device_id, minutesDown: mins },
    })

    // Latch AFTER sending, so a push failure retries on the next tick instead of
    // going quiet — the failure mode this whole feature exists to prevent.
    const { error: latchErr } = await supabase
      .from('bridge_status')
      .update({ alerted_at: new Date().toISOString() })
      .eq('device_id', b.device_id)
    if (latchErr) console.error('[bridge-health] latch failed:', latchErr)
    else alerted++

    console.error(`[bridge-health] ALERTED: ${who} offline ${mins} min, next session ${next.start_time}`)
  }

  return NextResponse.json({ ok: true, down: down.length, alerted })
}
