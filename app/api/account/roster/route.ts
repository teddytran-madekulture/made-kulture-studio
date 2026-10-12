// /api/account/roster — the OWNER's side of a company roster (migration 168).
//   GET   → { roster: null } when this account has no roster (or it's hidden),
//           else the fields the owner may edit
//   PATCH {label?, portfolio_label?, about_tagline?, about_bio?, about_instagram?, about_website?}
//
// The owner describes their company here; they can NEVER change status, cities,
// the source site or the tag — those stay admin-only in /api/admin/rosters, so
// "the company said yes" is still the admin's call.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cleanIgHandle } from '@/lib/directory-listing'
import { ROSTER_ABOUT_LIMITS as L, siteOrigin } from '@/lib/roster'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const db = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const FIELDS = 'id, status, label, source_url, about_tagline, about_bio, about_instagram, about_website, portfolio_label'

async function me() {
  const { data: { user } } = await createClient().auth.getUser()
  return user
}

export async function GET() {
  const user = await me()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await db.from('company_rosters').select(FIELDS)
    .eq('owner_id', user.id).neq('status', 'hidden').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ roster: data ?? null })
}

const text = (v: unknown, max: number) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max)

export async function PATCH(req: NextRequest) {
  const user = await me()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (body.label !== undefined) patch.label = text(body.label, L.label).replace(/\s+/g, ' ') || 'Roster'
  if (body.portfolio_label !== undefined) patch.portfolio_label = text(body.portfolio_label, L.label).replace(/\s+/g, ' ')
  if (body.about_tagline !== undefined) patch.about_tagline = text(body.about_tagline, L.tagline).replace(/\s+/g, ' ')
  if (body.about_bio !== undefined) patch.about_bio = text(body.about_bio, L.bio)
  if (body.about_instagram !== undefined) patch.about_instagram = cleanIgHandle(body.about_instagram).slice(0, L.instagram)
  if (body.about_website !== undefined) {
    const w = text(body.about_website, L.website)
    if (!w) patch.about_website = ''
    else {
      try { patch.about_website = new URL(/^https?:\/\//i.test(w) ? w : `https://${w}`).toString(); siteOrigin(String(patch.about_website)) }
      catch { return NextResponse.json({ error: 'That website address is not valid.' }, { status: 400 }) }
    }
  }

  // Scoped to the caller's own roster; .select() so a match on nothing is a
  // 404, not a silent success.
  const { data, error } = await db.from('company_rosters').update(patch)
    .eq('owner_id', user.id).neq('status', 'hidden').select(FIELDS)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'No company page on this account.' }, { status: 404 })
  return NextResponse.json({ roster: data[0] })
}
