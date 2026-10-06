// GET /api/directory/stats — PUBLIC, no sign-in.
//
// 2026-10-02: the home-page directory teaser and the signed-out /directory
// landing page show how many people are listed and in which roles. COUNTS ONLY:
// members agreed to be seen by other members, not by the public, so no name,
// photo, handle or id ever leaves this route.
//
// "Listed" uses the same test as /api/directory (lib/directory-listing.ts) so
// the number on the home page matches what a member actually sees inside.
import { selectAll } from '@/lib/select-all'
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isProfileComplete } from '@/lib/directory-listing'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const service = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET() {
  const [{ data: profiles, error }, { data: pics, error: picErr }] = await Promise.all([
    selectAll(() => service.from('customer_profiles')
      .select('id, full_name, roles, instagram, bio, links, account_type, created_at, vendor_terms_accepted_at')
      .eq('directory_opt_in', true).order('id')),
    selectAll(() => service.from('portfolio_images').select('user_id').order('id')),
  ])
  // A failed read must never render as "0 members" on the home page.
  if (error || picErr) return NextResponse.json({ error: 'unavailable' }, { status: 503 })

  const withPhotos = new Set((pics ?? []).map((p: { user_id: string }) => p.user_id))
  const listed = (profiles ?? []).filter(p => isProfileComplete(p as any, withPhotos.has(p.id)))

  const byRole: Record<string, number> = {}
  let brands = 0
  // "Growing": listed members whose account is under 30 days old.
  const monthAgo = Date.now() - 30 * 864e5
  const newThisMonth = listed.filter(m => m.created_at && Date.parse(m.created_at) >= monthAgo).length
  for (const m of listed) {
    if (m.account_type === 'brand') brands++
    for (const r of (m.roles ?? []) as string[]) byRole[r] = (byRole[r] || 0) + 1
  }
  const roles = Object.entries(byRole)
    .map(([role, count]) => ({ role, count }))
    .sort((a, b) => b.count - a.count || a.role.localeCompare(b.role))

  return NextResponse.json(
    { total: listed.length, newThisMonth, brands, roles },
    // Counts barely move; keep the public route cheap (see vercel-cpu note).
    { headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' } },
  )
}
