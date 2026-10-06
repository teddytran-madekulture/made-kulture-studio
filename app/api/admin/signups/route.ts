import { NextRequest, NextResponse } from 'next/server'
import { listAllAuthUsers } from '@/lib/auth-user'
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

  // All pages (2026-10-06) — one page of 1,000 would hide the NEWEST signups
  // first, which is exactly what this screen exists to show.
  let all: any[] = []
  try { all = await listAllAuthUsers(supabase) }
  catch (e: any) { return NextResponse.json({ error: `Could not list logins: ${e.message}` }, { status: 500 }) }
  const users = all
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

  return NextResponse.json({ signups, total: all.length })
}

// DELETE /api/admin/signups { ids: string[] } — remove junk sign-ups (2026-10-05:
// bots signing up with stolen addresses). PERMANENT. Each id is checked first
// and SKIPPED, never deleted, if the account has anything real attached:
// bookings, studio credit / rewards, messages, castings, service listings or
// portfolio photos — or is the owner. Returns { deleted, skipped: [{id, reason}] }.
const OWNER_EMAILS = ['teddytran@madekulture.com']

export async function DELETE(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({} as any))
  const ids: string[] = Array.isArray(body.ids) ? body.ids.filter((x: unknown) => typeof x === 'string' && /^[0-9a-f-]{36}$/i.test(x as string)).slice(0, 100) : []
  if (!ids.length) return NextResponse.json({ error: 'No accounts selected.' }, { status: 400 })

  const count = async (table: string, col: string, id: string) => {
    const { count, error } = await supabase.from(table).select('*', { count: 'exact', head: true }).eq(col, id)
    if (error) throw new Error(`${table}: ${error.message}`)   // can't prove it's empty → don't delete
    return count ?? 0
  }

  const deleted: string[] = []
  const skipped: { id: string; reason: string }[] = []
  for (const id of ids) {
    try {
      const { data: u, error: uErr } = await supabase.auth.admin.getUserById(id)
      if (uErr || !u?.user) { skipped.push({ id, reason: 'not found' }); continue }
      if (OWNER_EMAILS.includes((u.user.email || '').toLowerCase())) { skipped.push({ id, reason: 'owner account' }); continue }
      const checks: [string, string, string][] = [
        ['bookings', 'auth_user_id', 'has bookings'],
        ['customer_credits', 'auth_user_id', 'has studio credit'],
        ['messages', 'sender_id', 'has sent messages'],
        ['castings', 'author_id', 'has castings'],
        ['service_listings', 'user_id', 'has service listings'],
        ['portfolio_images', 'user_id', 'has portfolio photos'],
      ]
      let reason = ''
      for (const [t, c, why] of checks) { if (await count(t, c, id) > 0) { reason = why; break } }
      if (reason) { skipped.push({ id, reason }); continue }

      await supabase.from('customer_profiles').delete().eq('id', id)
      const { error: dErr } = await supabase.auth.admin.deleteUser(id)
      if (dErr) { skipped.push({ id, reason: dErr.message }); continue }
      deleted.push(id)
    } catch (e: any) {
      skipped.push({ id, reason: e?.message || 'check failed' })
    }
  }
  return NextResponse.json({ deleted, skipped })
}
