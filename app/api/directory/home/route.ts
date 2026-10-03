// GET /api/directory/home — everything the signed-in directory home shows, in
// one request (2026-10-02, Directory Plan). Members only.
//
// • me          — always (name, avatar, First 100 number, listing state + blockers)
// • editorial   — always: it is already public on the studio home page. Credits
//                 that match a member's Instagram link to their profile.
// • newMembers, castings, fresh — ONLY when the viewer is listed. Same rule as
//   /api/directory (lib/directory-access.ts): no listing, no browsing.
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { memberAccess } from '@/lib/directory-access'
import { isProfileComplete, cleanIgHandle } from '@/lib/directory-listing'
import { pickEditorialForVisit } from '@/lib/featured-editorial-server'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const service = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to view the directory.' }, { status: 401 })

  let access
  try { access = await memberAccess(service, user.id) }
  catch { return NextResponse.json({ error: 'Could not load your listing.' }, { status: 500 }) }

  const [{ data: mine }, editorial] = await Promise.all([
    service.from('customer_profiles').select('full_name, avatar_url, founding_number').eq('id', user.id).maybeSingle(),
    pickEditorialForVisit(),
  ])

  // Everyone opted in (one query) — used to link editorial credits and, for a
  // listed viewer, the new-members row and the fresh-work owners.
  const [{ data: profiles, error: pErr }, { data: pics, error: picErr }] = await Promise.all([
    service.from('customer_profiles')
      .select('id, full_name, roles, bio, instagram, links, account_type, avatar_url, created_at')
      .eq('directory_opt_in', true),
    service.from('portfolio_images')
      .select('id, user_id, url, sort_order, is_mature, hidden, explore_hidden, created_at'),
  ])
  if (pErr || picErr) return NextResponse.json({ error: 'Could not load the directory.' }, { status: 500 })

  const withPhotos = new Set((pics ?? []).map(p => p.user_id))
  const listed = (profiles ?? []).filter(p => isProfileComplete(p as any, withPhotos.has(p.id)))
  const listedById = new Map(listed.map(p => [p.id, p]))
  const byHandle = new Map<string, string>()
  for (const p of listed) { const h = cleanIgHandle(p.instagram).toLowerCase(); if (h) byHandle.set(h, p.id) }

  const safePics = (pics ?? []).filter(p => !p.is_mature && !p.hidden && !p.explore_hidden)
  const firstPhoto = new Map<string, string>()
  for (const p of [...safePics].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))) {
    if (!firstPhoto.has(p.user_id)) firstPhoto.set(p.user_id, p.url)
  }

  const out: any = {
    me: {
      name: mine?.full_name ?? null,
      avatar: mine?.avatar_url ?? null,
      foundingNumber: mine?.founding_number ?? null,
      optedIn: access.optedIn,
      listed: access.listed,
      blockers: access.blockers,
      photos: (pics ?? []).filter(p => p.user_id === user.id).length,
    },
    editorial: editorial ? {
      title: editorial.title,
      subtitle: editorial.subtitle,
      setName: editorial.setName,
      setSlug: editorial.setSlug,
      postUrl: editorial.postUrl,
      photos: editorial.photos,
      credits: editorial.credits.map(c => ({ role: c.role, handle: c.handle, memberId: byHandle.get(c.handle.toLowerCase()) ?? null })),
    } : null,
    total: listed.length,
  }

  if (!access.listed) return NextResponse.json(out)

  const monthAgo = Date.now() - 30 * 864e5
  // Newest first, but members WITH a picture lead the row: an empty grey box
  // reads as broken. No-picture members only fill in if there aren't 6 others,
  // and the page draws their initial instead.
  const newest = [...listed].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).slice(0, 18)
  const pic = (p: any) => firstPhoto.get(p.id) ?? p.avatar_url ?? null
  out.newMembers = [...newest.filter(p => pic(p)), ...newest.filter(p => !pic(p))]
    .slice(0, 6)
    .map(p => ({
      id: p.id, name: p.full_name, roles: p.roles ?? [], account_type: p.account_type,
      photo: pic(p),
      isNew: Date.parse(p.created_at) >= monthAgo,
    }))

  // Newest first, but at most FRESH_PER_MEMBER photos per person (2026-10-02:
  // one member's batch upload filled half the grid). Only if there aren't
  // enough different people does it top up with more from the same members.
  const FRESH_PER_MEMBER = 1
  const newestPics = [...safePics]
    .filter(p => listedById.has(p.user_id))
    .sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at))
  const perMember = new Map<string, number>()
  const picked: typeof newestPics = []
  const extra: typeof newestPics = []
  for (const p of newestPics) {
    const n = perMember.get(p.user_id) ?? 0
    if (n < FRESH_PER_MEMBER) { picked.push(p); perMember.set(p.user_id, n + 1) } else extra.push(p)
  }
  out.fresh = [...picked, ...extra]
    .slice(0, 12)
    .map(p => ({ id: p.id, url: p.url, memberId: p.user_id, name: listedById.get(p.user_id)?.full_name ?? '' }))

  const { data: casts } = await service.from('castings')
    .select('id, title, compensation_type, roles_needed, set_slug, plan_mode, shoot_date, mature')
    .eq('status', 'open').gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false }).limit(3)
  out.castings = casts ?? []

  return NextResponse.json(out)
}
