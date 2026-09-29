import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { isProfileComplete } from '@/lib/directory-listing'
import { claimFoundingSpots, FOUNDING_CAP } from '@/lib/founding'

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

  // Access rule: only members who are themselves visible in the directory may
  // browse it. Opting out of visibility also opts you out of viewing.
  const { data: me } = await service
    .from('customer_profiles').select('directory_opt_in').eq('id', user.id).maybeSingle()
  if (!me?.directory_opt_in) {
    return NextResponse.json(
      { error: 'Join the directory to browse members.', optedOut: true },
      { status: 403 }
    )
  }

  const role = req.nextUrl.searchParams.get('role')

  let q = service
    .from('customer_profiles')
    .select('id, full_name, roles, instagram, avatar_url, bio, links, account_type, founding_number, founding_blocked, created_at, profile_color')
    .eq('directory_opt_in', true)
  if (role) q = q.contains('roles', [role])

  const { data, error } = await q.order('full_name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Members with at least one portfolio image (one query, built into a Set).
  const { data: pics } = await service.from('portfolio_images').select('user_id, url, is_mature, hidden, sort_order')
  const withPhotos = new Set((pics ?? []).map((p: { user_id: string }) => p.user_id))
  // Explore feed: up to 2 photos per member, never 18+ or archived — the grid
  // is browsed without the profile page's over-18 reveal. Capped per person so
  // a full 15-photo portfolio can't take over the feed.
  const feedPhotos = new Map<string, string[]>()
  for (const p of [...(pics ?? [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
    if (p.is_mature || p.hidden) continue
    const list = feedPhotos.get(p.user_id) ?? []
    if (list.length < 2) { list.push(p.url); feedPhotos.set(p.user_id, list) }
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

  const members = listed
    .map(m => ({ id: m.id, full_name: m.full_name, roles: m.roles ?? [], instagram: m.instagram ?? null, avatar_url: m.avatar_url ?? null, account_type: m.account_type === 'brand' ? 'brand' : 'creative', founding_number: m.founding_number ?? null, profile_color: m.profile_color ?? null, photos: feedPhotos.get(m.id) ?? [] }))

  return NextResponse.json({ members, founding: { cap: FOUNDING_CAP, taken: Math.min(taken, FOUNDING_CAP) } })
}
