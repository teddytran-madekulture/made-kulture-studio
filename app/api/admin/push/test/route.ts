// POST /api/admin/push/test — send a real push to every registered device and
// report what each one did.
//
// Why this exists: until 2026-09-05 every push in this app was a side effect of
// a real event (a booking, a kiosk summon, a door code). So "did the push
// arrive?" could only be asked by CAUSING one — walking to the door and punching
// a code — and when nothing arrived there was no way to tell which hop failed.
// The push services return 201 for "accepted for delivery", which is NOT
// "displayed on a phone", and that gap is where two weeks went.
//
// This returns the per-subscription outcome so the answer is a fact, not a guess.

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { sendOwnerPushDetailed, pushConfigured } from '@/lib/push'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (!pushConfigured()) {
    // Dormant is a legitimate state (lib/push.ts returns early), and it looks
    // EXACTLY like a delivery failure from the outside. Say which it is.
    return NextResponse.json({
      ok: false,
      reason: 'VAPID keys not set in this environment — push is dormant, nothing was sent.',
    }, { status: 200 })
  }

  const stamp = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', second: '2-digit',
  }).format(new Date())

  const result = await sendOwnerPushDetailed({
    title: 'Test push',
    body: `Sent at ${stamp} Central. If you can read this, delivery works.`,
    url: '/admin/dashboard',
    // No tag: a tagged push REPLACES an earlier one with the same tag, which
    // during testing looks identical to nothing arriving.
    renotify: true,
    requireInteraction: true,
  })

  return NextResponse.json({ ok: true, sentAt: stamp, ...result })
}
