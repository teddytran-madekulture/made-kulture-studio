// GET /api/directory/stats — PUBLIC, no sign-in.
//
// 2026-10-02: the home-page directory teaser and the signed-out /directory
// landing page show how many people are listed and in which roles. COUNTS ONLY:
// members agreed to be seen by other members, not by the public, so no name,
// photo, handle or id ever leaves this route.
//
// "Listed" uses the same test as /api/directory (lib/directory-listing.ts) so
// the number on the home page matches what a member actually sees inside.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getDirectoryCounts } from '@/lib/directory-stats'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// The counting lives in lib/directory-stats.ts (shared with the kiosk ad).
export async function GET() {
  let counts
  // A failed read must never render as "0 members" on the home page.
  try { counts = await getDirectoryCounts(service) }
  catch { return NextResponse.json({ error: 'unavailable' }, { status: 503 }) }
  return NextResponse.json(
    counts,
    // Counts barely move; keep the public route cheap (see vercel-cpu note).
    { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' } },
  )
}
