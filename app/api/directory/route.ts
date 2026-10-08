import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { selectAll } from '@/lib/select-all'
import { memberAccess, notListedResponse } from '@/lib/directory-access'
import { isProfileComplete } from '@/lib/directory-listing'
import { publicAccountType } from '@/lib/roles'
import { claimFoundingSpots, FOUNDING_CAP } from '@/lib/founding'
import { blockedIds } from '@/lib/blocks'

// Service client to read across profiles; we only ever expose opted-in members
// and never return email/phone.
const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/directory?role=Photographer — members who opted into the directory
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to view the directory.' }, { status: 401 })

  // Access rule: only members who are themselves LISTED (opted in AND a
  // complete profile) may browse it. See lib/directory-access.ts.
  const me = await memberAccess(service, user.id)
  if (!me.listed) return notListedResponse(me, 'browse members')

  const role = req.nextUrl.searchParams.get('role')

  let q = service
    .from('customer_profiles')
    .select('id, full_name, roles, instagram, avatar_url, bio, links, account_type, founding_number, founding_blocked, created_at, profile_color, vendor_terms_accepted_at')
    .eq('directory_opt_in', true)
  if (role) q = q.contains('roles', [role])

  // All pages (2026-10-06) — see lib/select-all.ts.
  const { data, error } = await selectAll(() => {
    let b = service
      .from('customer_profiles')
      .select('id, full_name, roles, instagram, avatar_url, bio, links, account_type, founding_number, founding_blocked, created_at, profile_color, vendor_terms_accepted_at')
      .eq('directory_opt_in', true)
    if (role) b = b.contains('roles', [role])
    return b.order('full_name', { ascending: true }).order('id')
  })
  void q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Members with at least one portfolio image (one query, built into a Set).
  const { data: pics, error: picsErr } = await selectAll(() => service.from('portfolio_images').select('user_id, url, is_mature, hidden, explore_hidden, sort_order').order('id'))
  if (picsErr) return NextResponse.json({ error: picsErr.message }, { status: 500 })
  const withPhotos = new Set((pics ?? []).map((p: { user_id: string }) => p.user_id))
  // Explore feed candidates: every photo a member could show in Explore —
  // never 18+ or archived (the grid has no over-18 reveal). The page shows ONE
  // per member per visit and rotates which one, so a full portfolio gets seen
  // over time without taking over the grid.
  const feedPhotos = new Map<string, string[]>()
  for (const p of [...(pics ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
    // explore_hidden: Teddy (or 3 member reports) took it off Explore — it still
    // shows on the member's own profile. See migration 131.
    if (p.is_mature || p.hidden || p.explore_hidden) continue
    const list = feedPhotos.get(p.user_id) ?? []
    if (list.length < 15) { list.push(p.url); feedPhotos.set(p.user_id, list) }
  }

  // Minimum profile to be listed: name + bio + (photo | link | IG), and — for
  // creatives — at least one role. Brands don't have creative roles.
  // ⚠️ The rule itself lives in lib/directory-listing.ts so /admin/directory can
  // show WHY an opted-in member is not showing up, using this exact test rather
  // than a second copy of it.
  const listed = (data ?? []).filter(m => isProfileComplete(m, withPhotos.has(m.id)))

  // Founding Creatives: anyone listed without a number gets one while spots
  // remain (only when the WHOLE directory is fetched — a role-filtered list
  // would hand numbers out of join order).
  let taken = listed.filter(m => m.founding_number).length
  if (!role) {
    const { count } = await service.from('customer_profiles').select('id', { count: 'exact', head: true }).not('founding_number', 'is', null)
    taken = count ?? taken
    if (taken < FOUNDING_CAP && listed.some(m => !m.founding_number && !m.founding_blocked)) {
      const got = await claimFoundingSpots(service, listed, id => withPhotos.has(id))
      for (const m of listed) if (got.has(m.id)) m.founding_number = got.get(m.id)!
      taken += got.size
    }
  }

  // Blocked either way (migration 148) → neither sees the other.
  let hidden: Set<string>
  try { hidden = await blockedIds(service, user.id) }
  catch { return NextResponse.json({ error: 'Could not load the directory.' }, { status: 500 }) }

  const members = listed
    .filter(m => !hidden.has(m.id))
    .map(m => ({ id: m.id, full_name: m.full_name, roles: m.roles ?? [], instagram: m.instagram ?? null, avatar_url: m.avatar_url ?? null, account_type: publicAccountType(m.account_type), founding_number: m.founding_number ?? null, profile_color: m.profile_color ?? null, photos: feedPhotos.get(m.id) ?? [] }))

  return NextResponse.json({ members, founding: { cap: FOUNDING_CAP, taken: Math.min(taken, FOUNDING_CAP) } })
}
