import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { memberAccess, notListedResponse } from '@/lib/directory-access'
import { publicAccountType } from '@/lib/roles'
import { creditsForImages, photosTaggingMember } from '@/lib/photo-credits'

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

  const me = await memberAccess(service, user.id)
  if (!me.listed) return notListedResponse(me, 'view members')

  const { data: p } = await service
    .from('customer_profiles')
    .select('id, full_name, roles, instagram, avatar_url, bio, links, video_url, phone, show_email, show_phone, directory_opt_in, account_type, founding_number, profile_color, cover_url, credits, cv_url')
    .eq('id', params.id)
    .maybeSingle()

  // Only surface members who are actually listed — opted in AND complete, the
  // same test the directory grid uses, so a profile the grid hides can't be
  // reached by URL either.
  if (!p || !(p.id === user.id || (await memberAccess(service, p.id)).listed)) {
    return NextResponse.json({ error: 'Member not found.' }, { status: 404 })
  }

  const { data: images } = await service
    .from('portfolio_images')
    .select('id, url, is_mature, sort_order')
    .eq('user_id', params.id)
    .eq('hidden', false)
    .order('sort_order', { ascending: true })

  // Production Services listings (migration 135). Read here with the service
  // role AFTER the members-only gate above — the table's RLS only lets a member
  // read their own rows, so this route is the one way others see them.
  const { data: listingRows, error: listErr } = await service
    .from('service_listings')
    .select('id, category, title, details, rate, price_cents, price_unit, price_extras, notes, photos, tags')
    .eq('user_id', params.id)
    .eq('active', true)
    .eq('review_hold', false)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })
  if (listErr) console.error('[directory/id] listings lookup failed:', listErr.message)

  // Photo credits (migration 133): who's credited on each photo, and photos in
  // OTHER members' portfolios that credit this member (the TAGGED tab).
  const credits = await creditsForImages(service, (images ?? []).map(i => i.id))
  const tagged = await photosTaggingMember(service, params.id, p.instagram ?? null)

  // Email lives in auth, not the profile row — fetch it only when shown.
  let email: string | null = null
  if (p.show_email) {
    const { data: authUser } = await service.auth.admin.getUserById(params.id)
    email = authUser?.user?.email ?? null
  }

  // Follow counts + whether the viewer already follows this member.
  const [followersRes, followingRes, mineRes] = await Promise.all([
    service.from('follows').select('*', { count: 'exact', head: true }).eq('following_id', params.id),
    service.from('follows').select('*', { count: 'exact', head: true }).eq('follower_id', params.id),
    service.from('follows').select('follower_id').eq('follower_id', user.id).eq('following_id', params.id).maybeSingle(),
  ])

  return NextResponse.json({
    member: {
      id: p.id,
      full_name: p.full_name,
      account_type: publicAccountType(p.account_type),
      roles: p.roles ?? [],
      instagram: p.instagram ?? null,
      avatar_url: p.avatar_url ?? null,
      bio: p.bio ?? '',
      links: Array.isArray(p.links) ? p.links : [],
      video_url: p.video_url ?? null,
      email,
      phone: p.show_phone ? (p.phone ?? null) : null,
      portfolio: (images ?? []).map(i => ({ id: i.id, url: i.url, is_mature: i.is_mature, credits: credits.get(i.id) ?? [] })),
      tagged,
      listings: listingRows ?? [],
      founding_number: p.founding_number ?? null,
      profile_color: p.profile_color ?? null,
      credits: Array.isArray(p.credits) ? p.credits : [],
      cv_url: p.cv_url ?? null,
      cover_url: p.founding_number ? (p.cover_url ?? null) : null,
      is_self: p.id === user.id,
      followers: followersRes.count ?? 0,
      following: followingRes.count ?? 0,
      is_following: !!mineRes.data,
    },
  })
}
