// GET /api/admin/kiosk-links -- every set's kiosk short link in one place.
//
// Why this exists: the codes are DERIVED from KIOSK_KEY and never stored, so
// the only way to get one used to be computing the HMAC by hand. Set A's was
// generated that way on 2026-08-13 and was still the ONLY one that had ever
// existed on 2026-08-21 -- each of the remaining tablets would have needed the
// same manual step, with no record of the result anywhere.
//
// This returns the SHORT links only, never KIOSK_KEY. The entire point of
// /t/<code> is that the key is never typed on a tablet or read off a screen in
// a room full of guests, and a listing that leaked it would undo that.

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { kioskLinks } from '@/lib/kiosk-links'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const key = process.env.KIOSK_KEY
  if (!key) {
    // Same refusal as /t/: with no key there are no working links, and saying
    // so beats printing ten URLs that 404 once they are on a wall.
    return NextResponse.json({ error: 'KIOSK_KEY is not set - /t/ links are disabled' }, { status: 503 })
  }

  return NextResponse.json({ links: kioskLinks(key) })
}
