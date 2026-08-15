// GET  /api/admin/kiosk-ack  — is a guest waiting right now? (drives the banner)
// POST /api/admin/kiosk-ack  — "ON MY WAY". Teddy said it, explicitly.
//
// ⚠️ THIS USED TO FIRE AUTOMATICALLY and that was the bug. KioskAck pinged it on
// mount and on every focus/visibility change, and sw.js pinged it on any tap of
// the notification. So opening the admin at 7:02 to glance at the calendar marked
// a 7:01 ring as answered: the escalating pushes stopped, and Teddy never saw it.
// "Seen" and "coming" are different facts and only one of them helps the guest
// standing at the tablet.
//
// Now the ONLY things that write this are the ON MY WAY button in the admin
// banner and the ON MY WAY action on the notification itself.

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const NO_ANSWER_MS = 3 * 60 * 1000
const RING_TTL_MS  = 6 * 60 * 1000

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('studio_settings')
    .select('key, value')
    .in('key', ['kiosk_summon_at', 'kiosk_summon_ack_at', 'kiosk_summon_set'])
  if (error) {
    console.error('[kiosk ack] read error:', error)
    return NextResponse.json({ ringing: false, error: error.message }, { status: 500 })
  }
  const map: Record<string, string> = {}
  for (const r of data ?? []) map[r.key] = r.value

  const summonAt = map['kiosk_summon_at'] ? Date.parse(map['kiosk_summon_at']) : 0
  const ackAt    = map['kiosk_summon_ack_at'] ? Date.parse(map['kiosk_summon_ack_at']) : 0
  const age      = summonAt ? Date.now() - summonAt : 0

  // Banner shows for an unanswered ring inside the window. Past RING_TTL_MS the
  // guest's tablet has already given up and shown them the studio number, so a
  // banner would send Teddy chasing someone who has moved on.
  const ringing = !!summonAt && ackAt < summonAt && age < RING_TTL_MS

  return NextResponse.json({
    ringing,
    place: map['kiosk_summon_set'] ?? '',
    waitedSec: ringing ? Math.round(age / 1000) : 0,
    goneQuiet: ringing && age >= NO_ANSWER_MS,   // they've been given the phone number
  })
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const nowIso = new Date().toISOString()
  const { error } = await supabase
    .from('studio_settings')
    .upsert({ key: 'kiosk_summon_ack_at', value: nowIso, updated_at: nowIso }, { onConflict: 'key' })
  if (error) {
    // Read the error or a no-op write reports success and the guest keeps waiting.
    console.error('[kiosk ack] write FAILED:', error)
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
