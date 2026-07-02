import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

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
    .select('id, full_name, roles, instagram, avatar_url, bio, links, account_type')
    .eq('directory_opt_in', true)
  if (role) q = q.contains('roles', [role])

  const { data, error } = await q.order('full_name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Members with at least one portfolio image (one query, built into a Set).
  const { data: pics } = await service.from('portfolio_images').select('user_id')
  const withPhotos = new Set((pics ?? []).map((p: { user_id: string }) => p.user_id))

  // Minimum profile to be listed: name + bio + (photo | link | IG), and — for
  // creatives — at least one role. Brands don't have creative roles.
  const isComplete = (m: {
    id: string; full_name: string | null; roles: string[] | null;
    bio: string | null; instagram: string | null; links: unknown; account_type?: string | null
  }) =>
    !!(m.full_name ?? '').trim() &&
    (m.account_type === 'brand' || (m.roles?.length ?? 0) > 0) &&
    !!(m.bio ?? '').trim() &&
    (withPhotos.has(m.id) || (Array.isArray(m.links) && m.links.length > 0) || !!(m.instagram ?? '').trim())

  const members = (data ?? [])
    .filter(isComplete)
    .map(m => ({ id: m.id, full_name: m.full_name, roles: m.roles ?? [], instagram: m.instagram ?? null, avatar_url: m.avatar_url ?? null, account_type: m.account_type === 'brand' ? 'brand' : 'creative' }))

  return NextResponse.json({ members })
}
