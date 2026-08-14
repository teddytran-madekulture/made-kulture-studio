// GET /t/<code>  →  302 to /kiosk?set=<slug>&key=<KIOSK_KEY>
//
// Typing an 80-character URL on a tablet keyboard, nine times, is how setup
// mistakes happen. This is the short version: /t/a1b2c3d4.
//
// ⚠️ THE CODE IS DERIVED FROM THE KEY, NOT STORED.
//   code = HMAC-SHA256(KIOSK_KEY, slug), first 8 hex chars
// Two things fall out of that, both deliberate:
//   1. No second secret to manage — no extra env var, no table, nothing to
//      drift out of sync with KIOSK_KEY.
//   2. Rotating KIOSK_KEY rotates every short code automatically. Old codes
//      stop working the moment the key changes, which is what you want from a
//      rotation and what a stored mapping would quietly fail to do.
//
// ⚠️ A GUESSABLE short path would undo the key entirely, which is why the code
// is an HMAC and not "/t/a". Eight hex chars is 4.3 billion possibilities for
// something that is only ever typed once per tablet.
//
// ⚠️ REFUSES when KIOSK_KEY is unset. Without a key there is nothing to protect
// and nothing to derive from, so this would be a plain open redirect handing
// out set identities to anyone. Better to 404 than to pretend.

import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { SLUG_TO_NAME } from '@/lib/booking-core'

export const dynamic = 'force-dynamic'

export function shortCodeFor(slug: string, key: string): string {
  return createHmac('sha256', key).update(slug).digest('hex').slice(0, 8)
}

function sameCode(a: string, b: string): boolean {
  // Length-safe compare; both are fixed-length hex so this is well-defined.
  if (a.length !== b.length) return false
  try { return timingSafeEqual(Buffer.from(a), Buffer.from(b)) } catch { return false }
}

export async function GET(_req: NextRequest, { params }: { params: { code: string } }) {
  const key = process.env.KIOSK_KEY
  if (!key) {
    console.error('[/t] KIOSK_KEY is unset — refusing to hand out kiosk URLs')
    return new NextResponse('Not found', { status: 404 })
  }

  const code = String(params.code || '').toLowerCase()
  const slug = Object.keys(SLUG_TO_NAME).find(s => sameCode(shortCodeFor(s, key), code))
  if (!slug) return new NextResponse('Not found', { status: 404 })

  const url = new URL('/kiosk', process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app')
  url.searchParams.set('set', slug)
  url.searchParams.set('key', key)
  // 307 keeps it a temporary redirect: browsers and Fully won't cache the
  // destination, so a rotated key takes effect on the next load rather than
  // living forever in a tablet's redirect cache.
  return NextResponse.redirect(url.toString(), 307)
}
