// GET /api/listings — every active Production Services listing from a vendor
// who is actually LISTED in the directory (opted in, complete profile, signed
// Vendor Agreement). Powers /account/directory/services. Members-only, same
// gate as browsing people. Search/filtering happen on the page — the set is
// small, and it keeps typing instant.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { memberAccess, notListedResponse } from '@/lib/directory-access'
import { profileBlockers } from '@/lib/directory-listing'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const service = createService(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET() {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to view services.' }, { status: 401 })
  const me = await memberAccess(service, user.id)
  if (!me.listed) return notListedResponse(me, 'browse services')

  const { data: rows, error } = await service.from('service_listings')
    .select('id, user_id, category, title, details, rate, notes, photos, tags, created_at')
    .eq('active', true).order('created_at', { ascending: false })
  // A failed read must never render as "no services yet".
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = Array.from(new Set((rows ?? []).map(r => r.user_id)))
  if (ids.length === 0) return NextResponse.json({ listings: [] })

  const [{ data: profs, error: pErr }, { data: pics, error: picErr }] = await Promise.all([
    service.from('customer_profiles').select('id, full_name, roles, bio, instagram, links, account_type, directory_opt_in, vendor_terms_accepted_at, avatar_url').in('id', ids),
    service.from('portfolio_images').select('user_id').in('user_id', ids),
  ])
  if (pErr || picErr) return NextResponse.json({ error: (pErr || picErr)!.message }, { status: 500 })
  const withPhotos = new Set((pics ?? []).map(p => p.user_id))
  // Same "is this member listed?" rule as everywhere else (lib/directory-listing).
  const listed = new Map((profs ?? [])
    .filter(p => p.directory_opt_in && profileBlockers(p as any, withPhotos.has(p.id)).length === 0)
    .map(p => [p.id, p]))

  const listings = (rows ?? []).filter(r => listed.has(r.user_id)).map(r => {
    const v = listed.get(r.user_id)!
    return {
      id: r.id, category: r.category, title: r.title, details: r.details, rate: r.rate, notes: r.notes,
      photos: r.photos ?? [], tags: r.tags ?? [],
      vendor: { id: v.id, name: v.full_name ?? '', avatar_url: v.avatar_url ?? null },
      is_self: r.user_id === user.id,
    }
  })
  return NextResponse.json({ listings })
}
