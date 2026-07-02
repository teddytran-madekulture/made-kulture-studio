import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/admin/signups?limit=50 — most recent account signups (auth users),
// enriched with their creative-profile info (roles, directory visibility).
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const limit = Math.min(100, Math.max(1, parseInt(req.nextUrl.searchParams.get('limit') ?? '50')))

  // Pull auth users (small user base — one page covers it), newest first.
  const { data, error } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1000 })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const users = (data?.users ?? [])
    .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, limit)

  // Enrich with customer_profiles (roles / directory / onboarding).
  const ids = users.map((u: any) => u.id)
  const profiles: Record<string, any> = {}
  if (ids.length) {
    const { data: profs } = await supabase
      .from('customer_profiles')
      .select('id, full_name, instagram, roles, directory_opt_in, onboarded')
      .in('id', ids)
    for (const p of profs ?? []) profiles[p.id] = p
  }

  const signups = users.map((u: any) => {
    const p = profiles[u.id] || {}
    const provider = u.app_metadata?.provider || (u.identities?.[0]?.provider) || 'email'
    return {
      id:            u.id,
      email:         u.email,
      name:          p.full_name || u.user_metadata?.full_name || '',
      createdAt:     u.created_at,
      confirmed:     !!u.email_confirmed_at,
      provider,                              // 'email' | 'google' | …
      instagram:     p.instagram || null,
      roles:         p.roles ?? [],
      inDirectory:   !!p.directory_opt_in,
      onboarded:     p.onboarded !== false,  // treat missing as onboarded
    }
  })

  return NextResponse.json({ signups, total: data?.users?.length ?? signups.length })
}
