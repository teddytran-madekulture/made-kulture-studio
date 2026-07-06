// POST /api/kiosk/summon { key?, note? }
// "Get the team" button on the kiosk — pushes Teddy's devices. Rate-limited so
// a bored kid can't turn his phone into a buzzer.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendOwnerPush } from '@/lib/push'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

let lastSummon = 0
const COOLDOWN_MS = 90_000

function keyOk(key: unknown): boolean {
  const required = process.env.KIOSK_KEY
  if (!required) return true
  return typeof key === 'string' && key === required
}

export async function POST(req: NextRequest) {
  let body: any = {}
  try { body = await req.json() } catch {}
  if (!keyOk(body?.key)) return NextResponse.json({ error: 'Unauthorized kiosk' }, { status: 401 })

  const now = Date.now()
  if (now - lastSummon < COOLDOWN_MS) {
    // Still tell the guest it worked — the first ping already went out.
    return NextResponse.json({ success: true, throttled: true })
  }
  lastSummon = now

  const note = String(body?.note ?? '').trim().slice(0, 140)

  // Persist the ring so the admin app (open on Teddy's phone/desktop) can poll it
  // and raise a loud in-app alarm. In-memory state above doesn't survive across
  // serverless instances, so the DB timestamp is the source of truth for the alarm.
  await supabase
    .from('studio_settings')
    .upsert({ key: 'kiosk_summon_at', value: new Date(now).toISOString(), updated_at: new Date(now).toISOString() }, { onConflict: 'key' })
    .then(undefined, e => console.error('[kiosk summon] persist error:', e))

  await sendOwnerPush({
    title: '🛎️ Kiosk: someone needs you',
    body: note || 'A guest at the front kiosk tapped "Get the team".',
    url: '/admin/inbox',
    tag: 'kiosk-summon',
  }).catch(e => console.error('[kiosk summon] push error:', e))

  return NextResponse.json({ success: true })
}
