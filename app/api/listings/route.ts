// GET /api/listings — every active Production Services listing from a vendor
// who is actually LISTED in the directory (opted in, complete profile, signed
// Vendor Agreement). Powers /account/directory/services. Members-only, same
// gate as browsing people. Search/filtering happen on the page — the set is
// small, and it keeps typing instant.
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { memberAccess, notListedResponse } from '@/lib/directory-access'
import { loadVisibleListings } from '@/lib/service-listings'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const service = createService(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET() {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to view services.' }, { status: 401 })
  const me = await memberAccess(service, user.id)
  if (!me.listed) return notListedResponse(me, 'browse services')

  let listings
  // A failed read must never render as "no services yet".
  try { listings = await loadVisibleListings(service, user.id) }
  catch (e: any) { return NextResponse.json({ error: e?.message || 'Could not load services.' }, { status: 500 }) }
  return NextResponse.json({ listings })
}
