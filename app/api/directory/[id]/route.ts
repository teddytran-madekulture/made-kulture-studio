import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/directory/<id> — a single member's public profile + portfolio.
// Members-only both ways: the viewer must be signed in AND listed in the
// directory. Email/phone are only included when the member opted to show them.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to view profiles.' }, { status: 401 })

  const { data: me } = await service
    .from('customer_profiles').select('directory_opt_in').eq('id', user.id).maybeSingle()
  if (!me?.directory_opt_in) {
    return NextResponse.json({ error: 'Join the directory to view members.', optedOut: true }, { status: 403 })
  }

  const { data: p } = await service
    .from('customer_profiles')
    .select('id, full_name, roles, instagram, avatar_url, bio, links, video_url, phone, show_email, show_phone, directory_opt_in, account_type')
    .eq('id', params.id)
    .maybeSingle()

  // Only surface members who are actually listed.
  if (!p || !p.directory_opt_in) {
    return NextResponse.json({ error: 'Member not found.' }, { status: 404 })
  }

  const { data: images } = await service
    .from('portfolio_images')
    .select('id, url, is_mature, sort_order')
    .eq('user_id', params.id)
    .eq('hidden', false)
    .order('sort_order', { ascending: true })

  // Email lives in auth, not the profile row — fetch it only when shown.
  let email: string | null = null
  if (p.show_email) {
    const { data: authUser } = await service.auth.admin.getUserById(params.id)
    email = authUser?.user?.email ?? null
  }

  return NextResponse.json({
    member: {
      id: p.id,
      full_name: p.full_name,
      account_type: p.account_type === 'brand' ? 'brand' : 'creative',
      roles: p.roles ?? [],
      instagram: p.instagram ?? null,
      avatar_url: p.avatar_url ?? null,
      bio: p.bio ?? '',
      links: Array.isArray(p.links) ? p.links : [],
      video_url: p.video_url ?? null,
      email,
      phone: p.show_phone ? (p.phone ?? null) : null,
      portfolio: (images ?? []).map(i => ({ id: i.id, url: i.url, is_mature: i.is_mature })),
      is_self: p.id === user.id,
    },
  })
}
