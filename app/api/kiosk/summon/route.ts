// POST /api/kiosk/summon  { key?, set?, note? }  — a guest tapped "Get the team"
// GET  /api/kiosk/summon?key=…&set=…             — what the tablet polls to find
//                                                  out whether help is actually coming
//
// ⚠️ THE POINT OF THIS FILE. A guest must never be told "someone's on the way"
// unless a human actually said so. The previous version set that line the moment
// the fetch resolved — including when the 90-second throttle had swallowed the
// push and NOBODY had been notified at all. Two guests a minute apart and the
// second one was being lied to confidently.
//
// Everything is derived from studio_settings timestamps, never module memory:
// `lastSummon` in a module scope is per-serverless-instance, so it both
// double-pushed across instances and silently throttled on a warm one.
//
//   kiosk_summon_at      a guest rang
//   kiosk_summon_set     which tablet rang (so the push can say WHERE)
//   kiosk_summon_ack_at  Teddy tapped ON MY WAY — explicit, never implicit.
//                        Opening the admin for an unrelated reason must NOT
//                        count, or a ring gets marked answered by someone who
//                        never saw it.
//
// States the tablet can be in: waiting → onway, or waiting → noanswer.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendOwnerPush } from '@/lib/push'
import { getPageContent } from '@/lib/site-content'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const REPUSH_COOLDOWN_MS = 90 * 1000       // a live unanswered ring doesn't re-push
const NO_ANSWER_MS       = 3 * 60 * 1000   // tablet stops promising and shows the number
const RING_TTL_MS        = 6 * 60 * 1000   // matches the escalate cron's give-up window

function keyOk(key: unknown): boolean {
  const required = process.env.KIOSK_KEY
  if (!required) return true
  return typeof key === 'string' && key === required
}

// 'set-a' → 'SET A', 'front-door' → 'FRONT DOOR'. Deliberately not a DB lookup:
// the push only needs to tell Teddy which tablet rang, and a query here would
// fail closed on a ring, which is the one moment that must not fail.
function placeLabel(slug: unknown): string {
  const s = String(slug ?? '').trim()
  if (!s) return 'the kiosk'
  return s.replace(/[-_]+/g, ' ').toUpperCase()
}

async function readState() {
  const { data, error } = await supabase
    .from('studio_settings')
    .select('key, value')
    .in('key', ['kiosk_summon_at', 'kiosk_summon_ack_at', 'kiosk_summon_set'])
  if (error) console.error('[kiosk summon] read error:', error)
  const map: Record<string, string> = {}
  for (const r of data ?? []) map[r.key] = r.value
  const summonAt = map['kiosk_summon_at'] ? Date.parse(map['kiosk_summon_at']) : 0
  const ackAt    = map['kiosk_summon_ack_at'] ? Date.parse(map['kiosk_summon_ack_at']) : 0
  return { summonAt, ackAt, place: map['kiosk_summon_set'] ?? '' }
}

// The single place that decides what a guest is told. Compared as parsed
// instants, never as strings — '+00:00' and '-05:00' spell the same moment
// differently and a string compare gets it wrong.
function stateOf(summonAt: number, ackAt: number, now: number) {
  if (!summonAt) return { state: 'idle' as const, waitedSec: 0 }
  const age = now - summonAt
  if (ackAt >= summonAt) return { state: 'onway' as const, waitedSec: Math.round(age / 1000) }
  if (age >= NO_ANSWER_MS) return { state: 'noanswer' as const, waitedSec: Math.round(age / 1000) }
  return { state: 'waiting' as const, waitedSec: Math.round(age / 1000) }
}

export async function POST(req: NextRequest) {
  let body: any = {}
  try { body = await req.json() } catch {}
  if (!keyOk(body?.key)) return NextResponse.json({ error: 'Unauthorized kiosk' }, { status: 401 })

  const now = Date.now()
  const { summonAt, ackAt } = await readState()

  // A ring is still "live" if it hasn't been answered and hasn't aged out. Tapping
  // again during one must NOT reset the clock — the guest has been waiting since
  // the FIRST tap and the countdown to the fallback number should reflect that.
  const liveRing = !!summonAt && ackAt < summonAt && (now - summonAt) < RING_TTL_MS
  const withinCooldown = liveRing && (now - summonAt) < REPUSH_COOLDOWN_MS

  const place = placeLabel(body?.set)
  const note  = String(body?.note ?? '').trim().slice(0, 140)

  // Phone comes back on the ring itself, not on every poll — the tablet caches it
  // so the 5s status poll stays a two-column read and nothing more.
  let phone = ''
  try { phone = (await getPageContent('home'))?.footerPhone ?? '' } catch {}

  if (withinCooldown) {
    // Honest: the earlier ring is still outstanding, so report ITS age. No new
    // push (Teddy is already being escalated at), but no false promise either.
    const s = stateOf(summonAt, ackAt, now)
    return NextResponse.json({ ok: true, ...s, phone, reused: true })
  }

  const nowIso = new Date(now).toISOString()
  const { error: wErr } = await supabase
    .from('studio_settings')
    .upsert([
      { key: 'kiosk_summon_at',  value: nowIso, updated_at: nowIso },
      { key: 'kiosk_summon_set', value: place,  updated_at: nowIso },
    ], { onConflict: 'key' })
  if (wErr) {
    // supabase-js never throws on a Postgres error — if this isn't read, a failed
    // write looks exactly like a successful one. Tell the guest the truth.
    console.error('[kiosk summon] persist FAILED:', wErr)
    return NextResponse.json({ ok: false, state: 'failed', phone }, { status: 500 })
  }

  await sendOwnerPush({
    title: `🛎️ ${place} needs you`,
    body: note || `Someone at ${place} tapped "Get the team". Tap ON MY WAY so the tablet can tell them.`,
    url: '/admin/inbox',
    tag: 'kiosk-summon',
    renotify: true,
    requireInteraction: true,
    meta: { place },
  }).catch(e => console.error('[kiosk summon] push error:', e))

  return NextResponse.json({ ok: true, state: 'waiting', waitedSec: 0, phone })
}

export async function GET(req: NextRequest) {
  const key = req.nextUrl.searchParams.get('key')
  if (!keyOk(key ?? undefined)) return NextResponse.json({ error: 'Unauthorized kiosk' }, { status: 401 })
  const { summonAt, ackAt } = await readState()
  return NextResponse.json(stateOf(summonAt, ackAt, Date.now()))
}
