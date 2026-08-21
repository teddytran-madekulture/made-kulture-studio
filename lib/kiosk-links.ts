// Kiosk short links — the ONE place a /t/<code> is derived.
//
// code = HMAC-SHA256(KIOSK_KEY, slug), first 8 hex chars.
//
// This lives in lib/ rather than inside the route because two callers need it:
// app/t/[code]/route.ts resolves a code back to a slug, and the admin route
// lists them all. Duplicating a one-line HMAC would be the same mistake the
// SMS consolidation fixed -- two copies of a derivation drift, and a drifted
// copy here prints URLs that 404 on a wall-mounted tablet.

import { createHmac } from 'crypto'
import { SLUG_TO_NAME } from '@/lib/booking-core'

export function shortCodeFor(slug: string, key: string): string {
  return createHmac('sha256', key).update(slug).digest('hex').slice(0, 8)
}

export type KioskLink = { slug: string; name: string; code: string; url: string }

// Every set's short link. Derived on demand -- rotating KIOSK_KEY rotates the
// whole list, exactly as it rotates the codes themselves.
export function kioskLinks(key: string, baseUrl?: string): KioskLink[] {
  const base = (baseUrl || process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')
  return Object.entries(SLUG_TO_NAME).map(([slug, name]) => {
    const code = shortCodeFor(slug, key)
    return { slug, name, code, url: `${base}/t/${code}` }
  })
}
