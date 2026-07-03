// POST /api/kiosk/summon { key?, note? }
// "Get the team" button on the kiosk — pushes Teddy's devices. Rate-limited so
// a bored kid can't turn his phone into a buzzer.

import { NextRequest, NextResponse } from 'next/server'
import { sendOwnerPush } from '@/lib/push'

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
  await sendOwnerPush({
    title: '🛎️ Kiosk: someone needs you',
    body: note || 'A guest at the front kiosk tapped "Get the team".',
    url: '/admin/inbox',
    tag: 'kiosk-summon',
  }).catch(e => console.error('[kiosk summon] push error:', e))

  return NextResponse.json({ success: true })
}
