import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const service = createService(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function requireMember(userId: string) {
  const { data } = await service
    .from('customer_profiles').select('directory_opt_in').eq('id', userId).maybeSingle()
  return !!data?.directory_opt_in
}

// GET /api/castings?role=&comp=&q=&mine= — open castings (members-only), newest
// first, enriched with author + participant counts.
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to view castings.' }, { status: 401 })
  if (!(await requireMember(user.id))) {
    return NextResponse.json({ error: 'Join the directory to view castings.', optedOut: true }, { status: 403 })
  }

  const sp = req.nextUrl.searchParams
  const role = sp.get('role'), comp = sp.get('comp'), q = sp.get('q'), mine = sp.get('mine')

  let query = service.from('castings').select('*')
  if (mine === '1') query = query.eq('author_id', user.id)
  else query = query.eq('status', 'open').gt('expires_at', new Date().toISOString()) // hide expired from the board
  if (comp) query = query.eq('compensation_type', comp)
  if (role) query = query.contains('roles_needed', [role])
  if (q) query = query.or(`title.ilike.%${q}%,description.ilike.%${q}%`)

  const { data: rows, error } = await query.order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const list = rows ?? []

  const authorIds = [...new Set(list.map(c => c.author_id))]
  const authors: Record<string, { full_name: string | null; avatar_url: string | null }> = {}
  if (authorIds.length) {
    const { data } = await service
      .from('customer_profiles').select('id, full_name, avatar_url').in('id', authorIds)
    for (const p of data ?? []) authors[p.id] = { full_name: p.full_name, avatar_url: p.avatar_url }
  }

  const ids = list.map(c => c.id)
  const counts: Record<string, { interested: number; confirmed: number }> = {}
  if (ids.length) {
    const { data: parts } = await service
      .from('casting_participants').select('casting_id, status').in('casting_id', ids)
    for (const p of parts ?? []) {
      const c = counts[p.casting_id] ?? (counts[p.casting_id] = { interested: 0, confirmed: 0 })
      if (p.status === 'confirmed') c.confirmed++; else c.interested++
    }
  }

  // Team-channel unread flags — only for castings this user is on (author or confirmed).
  const myTeamIds = new Set<string>()
  for (const c of list) if (c.author_id === user.id) myTeamIds.add(c.id)
  if (ids.length) {
    const { data: myParts } = await service.from('casting_participants')
      .select('casting_id').eq('user_id', user.id).eq('status', 'confirmed').in('casting_id', ids)
    for (const p of myParts ?? []) myTeamIds.add(p.casting_id)
  }
  const unread: Record<string, boolean> = {}
  if (myTeamIds.size) {
    const teamIds = [...myTeamIds]
    const [readsRes, msgsRes] = await Promise.all([
      service.from('casting_reads').select('casting_id, last_read_at').eq('user_id', user.id).in('casting_id', teamIds),
      service.from('casting_messages').select('casting_id, created_at').in('casting_id', teamIds).order('created_at', { ascending: false }),
    ])
    const readAt: Record<string, string> = {}
    for (const r of readsRes.data ?? []) readAt[r.casting_id] = r.last_read_at
    const latest: Record<string, string> = {}
    for (const mrow of msgsRes.data ?? []) if (!latest[mrow.casting_id]) latest[mrow.casting_id] = mrow.created_at
    for (const cid of teamIds) {
      const lm = latest[cid]
      if (lm && (!readAt[cid] || new Date(lm) > new Date(readAt[cid]))) unread[cid] = true
    }
  }

  const castings = list.map(c => ({
    id: c.id,
    title: c.title,
    compensation_type: c.compensation_type,
    roles_needed: c.roles_needed ?? [],
    shoot_date: c.shoot_date,
    estimated_cost: c.estimated_cost,
    status: c.status,
    created_at: c.created_at,
    author: { id: c.author_id, name: authors[c.author_id]?.full_name || '(member)', avatar_url: authors[c.author_id]?.avatar_url || null },
    counts: counts[c.id] ?? { interested: 0, confirmed: 0 },
    has_unread_team: !!unread[c.id],
    expires_at: c.expires_at ?? null,
    mature: !!c.mature,
  }))
  return NextResponse.json({ castings })
}

// POST /api/castings — create a casting.
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!(await requireMember(user.id))) {
    return NextResponse.json({ error: 'Join the directory to post castings.' }, { status: 403 })
  }

  // Cap active castings per member (open + not expired).
  const { count: activeCount } = await service
    .from('castings').select('id', { count: 'exact', head: true })
    .eq('author_id', user.id).eq('status', 'open').gt('expires_at', new Date().toISOString())
  if ((activeCount ?? 0) >= 3) {
    return NextResponse.json({ error: 'You can have up to 3 active castings at once. Close or let one expire before posting another.' }, { status: 400 })
  }

  const b = await req.json().catch(() => ({}))
  const title = String(b.title ?? '').trim().slice(0, 120)
  if (!title) return NextResponse.json({ error: 'A title is required.' }, { status: 400 })

  const comp = ['paid', 'unpaid', 'tfp'].includes(b.compensation_type) ? b.compensation_type : 'tfp'
  const mode = ['none', 'set', 'buyout'].includes(b.plan_mode) ? b.plan_mode : 'none'
  const roles = Array.isArray(b.roles_needed) ? b.roles_needed.map((r: unknown) => String(r)).filter(Boolean).slice(0, 12) : []
  const equipment = Array.isArray(b.equipment)
    ? b.equipment.filter((e: { id?: unknown; name?: unknown }) => e && e.id && e.name)
        .map((e: { id: unknown; name: unknown; rate?: unknown; quantity?: unknown }) => ({
          id: String(e.id), name: String(e.name).slice(0, 80),
          rate: Number(e.rate) || 0, quantity: Math.max(1, Number(e.quantity) || 1),
        })).slice(0, 30)
    : []

  const row = {
    author_id: user.id,
    title,
    description: b.description ? String(b.description).slice(0, 2000) : null,
    compensation_type: comp,
    roles_needed: roles,
    plan_mode: mode,
    set_slug: mode === 'set' && b.set_slug ? String(b.set_slug) : null,
    hours: b.hours != null ? Number(b.hours) : null,
    guests: b.guests != null ? Number(b.guests) : null,
    equipment,
    shoot_date: b.shoot_date || null,
    start_hour: b.start_hour != null ? Number(b.start_hour) : null,
    estimated_cost: b.estimated_cost != null ? Number(b.estimated_cost) : null,
    status: 'open',
    mature: !!b.mature,
    expires_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
  }

  const { data, error } = await service.from('castings').insert(row).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ id: data.id })
}
