// GET /api/kiosk/context?set=set-a&key=XXXX
//
// What a per-set kiosk tablet needs to know about itself: which set it is
// bolted to, and who is on that set right now. The URL is the tablet's identity
// — same pattern as the jukebox players (?zone=&key=).
//
// ⚠️ KIOSK_KEY MATTERS MORE HERE THAN ON THE OTHER KIOSK ROUTES. /kiosk on its
// own is anonymous; this route answers "who is in Set A right now" and returns a
// customer's first name. On an unauthenticated public URL that is a real leak.
// The key is optional in code (so nothing breaks on the existing open tablet),
// but per-set tablets must not ship until KIOSK_KEY is set in Vercel.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { findActiveBookingBySet } from '@/lib/extensions'

export const dynamic = 'force-dynamic'
// Supabase reads in a polled route go stale with force-dynamic alone.
export const fetchCache = 'force-no-store'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function keyOk(key: string | null): boolean {
  const required = process.env.KIOSK_KEY
  if (!required) return true
  return key === required
}

export async function GET(req: NextRequest) {
  const setSlug = req.nextUrl.searchParams.get('set')
  if (!keyOk(req.nextUrl.searchParams.get('key'))) {
    return NextResponse.json({ error: 'Unauthorized kiosk' }, { status: 401 })
  }
  // No ?set= is the ORIGINAL shared tablet — a valid configuration, not an
  // error. It just has no set identity, so it gets no occupancy.
  if (!setSlug) return NextResponse.json({ set: null, occupancy: { kind: 'none' } })

  const { data: setRow } = await supabase
    .from('sets').select('name, slug').eq('slug', setSlug).maybeSingle()
  if (!setRow) {
    // A typo in the start URL would otherwise look like "nobody is ever booked"
    // forever, which is indistinguishable from a quiet day.
    return NextResponse.json({ error: `No set called "${setSlug}"` }, { status: 404 })
  }

  const occupancy = await findActiveBookingBySet(setSlug)
  return NextResponse.json({
    set: { slug: setRow.slug, name: setRow.name },
    occupancy,
    // Stamped so the tablet can tell a stale cached response from a live one.
    at: new Date().toISOString(),
  })
}
