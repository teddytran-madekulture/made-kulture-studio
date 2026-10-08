// Phone proof for the ADD TIME text link (2026-10-08).
//
// A kiosk ADD TIME request is confirmed one of two ways: on the tablet (the
// guest types the last 4 of the booking phone) or from the link we TEXT to
// that phone. Both used to POST the same token, so the server could not tell
// them apart and demanded the last 4 from the phone page too — which has no
// field for it. Every tap on the phone counted as a wrong try, and five taps
// cancelled the request (Set B, 2026-10-08: nothing charged, guest confused).
//
// The texted link now carries `?p=<proof>`, an HMAC of the token that only the
// SMS ever contains — the tablet never sees it. Holding it proves the request
// was opened from the booking phone, which is the whole point of the last 4.
import { createHmac, timingSafeEqual } from 'crypto'

function secret(): string {
  const s = process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || process.env.KIOSK_KEY
  if (!s) throw new Error('No signing secret set (SESSION_SECRET / ADMIN_PASSWORD / KIOSK_KEY)')
  return s
}

export function phoneProof(token: string): string {
  return createHmac('sha256', secret()).update(`ext-phone:${token}`).digest('hex').slice(0, 20)
}

export function isPhoneProof(token: string, given: unknown): boolean {
  if (typeof given !== 'string' || !/^[0-9a-f]{20}$/.test(given)) return false
  const want = Buffer.from(phoneProof(token))
  const got = Buffer.from(given)
  return want.length === got.length && timingSafeEqual(want, got)
}
