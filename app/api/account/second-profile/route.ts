// /api/account/second-profile — a VENDOR's own work as a second identity on
// their directory profile (migration 170, lib/second-profile.ts).
//   GET   → { eligible: false } for anyone who isn't a vendor, else
//           { eligible: true, second: {label, tagline, bio, instagram, website} }
//   PATCH {label?, tagline?, bio?, instagram?, website?} — vendors only
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { cleanIgHandle } from '@/lib/directory-listing'
import { SECOND_PROFILE_LIMITS as L, SECOND_PROFILE_COLUMNS } from '@/lib/second-profile'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const db = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const FIELDS = `account_type, ${SECOND_PROFILE_COLUMNS}`

async function me() {
  const { data: { user } } = await createClient().auth.getUser()
  return user
}

function shape(r: any) {
  return {
    label: r.second_label ?? '', tagline: r.second_tagline ?? '', bio: r.second_bio ?? '',
    instagram: r.second_instagram ?? '', website: r.second_website ?? '',
  }
}

export async function GET() {
  const user = await me()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await db.from('customer_profiles').select(FIELDS).eq('id', user.id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data || data.account_type !== 'vendor') return NextResponse.json({ eligible: false })
  return NextResponse.json({ eligible: true, second: shape(data) })
}

const text = (v: unknown, max: number) => String(v ?? '').replace(/\r\n/g, '\n').trim().slice(0, max)

export async function PATCH(req: NextRequest) {
  const user = await me()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))

  const patch: Record<string, unknown> = {}
  if (body.label !== undefined) patch.second_label = text(body.label, L.label).replace(/\s+/g, ' ')
  if (body.tagline !== undefined) patch.second_tagline = text(body.tagline, L.tagline).replace(/\s+/g, ' ')
  if (body.bio !== undefined) patch.second_bio = text(body.bio, L.bio)
  if (body.instagram !== undefined) patch.second_instagram = cleanIgHandle(body.instagram).slice(0, L.instagram)
  if (body.website !== undefined) {
    const w = text(body.website, L.website)
    if (!w) patch.second_website = ''
    else {
      try {
        const u = new URL(/^https?:\/\//i.test(w) ? w : `https://${w}`)
        if (!/^https?:$/.test(u.protocol) || !u.hostname.includes('.')) throw new Error('bad')
        patch.second_website = u.toString()
      } catch { return NextResponse.json({ error: 'That website address is not valid.' }, { status: 400 }) }
    }
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to save.' }, { status: 400 })

  // Vendors only, scoped to the caller's own row; .select() so a match on
  // nothing is a 403, not a silent success.
  const { data, error } = await db.from('customer_profiles').update(patch)
    .eq('id', user.id).eq('account_type', 'vendor').select(FIELDS)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'This is only for vendor accounts.' }, { status: 403 })
  return NextResponse.json({ eligible: true, second: shape(data[0]) })
}
