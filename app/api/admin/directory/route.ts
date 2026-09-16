import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { profileBlockers } from '@/lib/directory-listing'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/admin/directory — the Creative Directory as an ADMIN roster.
//
// ⚠️ This deliberately shows what `/api/directory` HIDES. The customer route
// returns only members who opted in AND have a complete profile, so the people
// worth acting on — opted in, invisible, waiting on a bio — are precisely the
// ones it cannot show. Every row here carries its `blockers`.
//
// ⚠️ Contact details are returned in full, ignoring `show_email`/`show_phone`.
// Those flags govern what MEMBERS see of each other; the studio owner already
// has this data on every booking. It is admin-authed and never public.
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: profiles, error } = await supabase
    .from('customer_profiles')
    .select('id, full_name, roles, instagram, avatar_url, bio, links, video_url, phone, directory_opt_in, account_type, onboarded')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Photo counts for everyone in ONE query — a per-row lookup would be ~N
  // round trips on a page whose whole job is showing every member at once.
  const { data: pics, error: picErr } = await supabase
    .from('portfolio_images')
    .select('user_id, hidden, is_mature')
  if (picErr) return NextResponse.json({ error: picErr.message }, { status: 500 })

  const photos: Record<string, { visible: number; hidden: number; mature: number }> = {}
  for (const pic of pics ?? []) {
    if (!photos[pic.user_id]) photos[pic.user_id] = { visible: 0, hidden: 0, mature: 0 }
    const row = photos[pic.user_id]
    if (pic.hidden) row.hidden++; else row.visible++
    if (pic.is_mature) row.mature++
  }

  // Emails and signup dates live in auth.users, not customer_profiles.
  const emails: Record<string, { email: string | null; created_at: string | null; confirmed: boolean }> = {}
  const { data: authData } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  for (const u of (authData?.users ?? []) as any[]) {
    emails[u.id] = { email: u.email ?? null, created_at: u.created_at ?? null, confirmed: !!u.email_confirmed_at }
  }

  const members = (profiles ?? [])
    // A plain booking customer who never touched the directory is not a
    // directory record; showing all 700 of them would bury the 20 that matter.
    .filter(p => p.directory_opt_in || (p.roles?.length ?? 0) > 0 || (p.bio ?? '').trim() || photos[p.id])
    .map(p => {
      const ph = photos[p.id] ?? { visible: 0, hidden: 0, mature: 0 }
      const au = emails[p.id] ?? { email: null, created_at: null, confirmed: false }
      const blockers = profileBlockers(p as any, ph.visible > 0)
      return {
        id: p.id,
        name: (p.full_name ?? '').trim(),
        email: au.email,
        emailConfirmed: au.confirmed,
        phone: p.phone ?? null,
        instagram: p.instagram ?? null,
        avatar: p.avatar_url ?? null,
        accountType: p.account_type === 'brand' ? 'brand' : p.account_type === 'creative' ? 'creative' : 'customer',
        roles: p.roles ?? [],
        hasBio: !!(p.bio ?? '').trim(),
        hasVideo: !!(p.video_url ?? '').trim(),
        linkCount: Array.isArray(p.links) ? p.links.length : 0,
        photos: ph,
        optedIn: !!p.directory_opt_in,
        onboarded: p.onboarded !== false,
        joined: au.created_at,
        // listed = what a member browsing /account/directory actually sees.
        listed: !!p.directory_opt_in && blockers.length === 0,
        blockers,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name) || (a.email ?? '').localeCompare(b.email ?? ''))

  return NextResponse.json({
    members,
    counts: {
      total:     members.length,
      listed:    members.filter(m => m.listed).length,
      // The actionable bucket: they said yes and still cannot be seen.
      incomplete: members.filter(m => m.optedIn && m.blockers.length > 0).length,
      optedOut:  members.filter(m => !m.optedIn).length,
    },
  })
}
