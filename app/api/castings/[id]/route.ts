import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const service = createService(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/castings/<id> — full casting + participants (with profiles).
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await service
    .from('customer_profiles').select('directory_opt_in').eq('id', user.id).maybeSingle()
  if (!me?.directory_opt_in) return NextResponse.json({ error: 'Join the directory to view castings.', optedOut: true }, { status: 403 })

  const { data: c } = await service.from('castings').select('*').eq('id', params.id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'Casting not found.' }, { status: 404 })

  const { data: author } = await service
    .from('customer_profiles').select('id, full_name, avatar_url').eq('id', c.author_id).maybeSingle()

  const { data: parts } = await service
    .from('casting_participants').select('user_id, status, created_at')
    .eq('casting_id', params.id).order('created_at', { ascending: true })

  const partIds = (parts ?? []).map(p => p.user_id)
  const profs: Record<string, { full_name: string | null; avatar_url: string | null; roles: string[] }> = {}
  if (partIds.length) {
    const { data } = await service
      .from('customer_profiles').select('id, full_name, avatar_url, roles').in('id', partIds)
    for (const p of data ?? []) profs[p.id] = { full_name: p.full_name, avatar_url: p.avatar_url, roles: p.roles ?? [] }
  }

  const participants = (parts ?? []).map(p => ({
    id: p.user_id,
    status: p.status,
    name: profs[p.user_id]?.full_name || '(member)',
    avatar_url: profs[p.user_id]?.avatar_url || null,
    roles: profs[p.user_id]?.roles || [],
  }))
  const myStatus = participants.find(p => p.id === user.id)?.status ?? null

  return NextResponse.json({
    casting: {
      ...c,
      author: { id: c.author_id, name: author?.full_name || '(member)', avatar_url: author?.avatar_url || null },
    },
    participants,
    isAuthor: c.author_id === user.id,
    myStatus,
  })
}

// PATCH /api/castings/<id> — author edits fields or changes status.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: c } = await service.from('castings').select('author_id').eq('id', params.id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (c.author_id !== user.id) return NextResponse.json({ error: 'Not your casting.' }, { status: 403 })

  const b = await req.json().catch(() => ({}))
  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (typeof b.title === 'string') patch.title = b.title.trim().slice(0, 120)
  if (typeof b.description === 'string') patch.description = b.description.slice(0, 2000)
  if (['paid', 'unpaid', 'tfp'].includes(b.compensation_type)) patch.compensation_type = b.compensation_type
  if (Array.isArray(b.roles_needed)) patch.roles_needed = b.roles_needed.map((r: unknown) => String(r)).filter(Boolean).slice(0, 12)
  if (['open', 'closed'].includes(b.status)) patch.status = b.status
  if (['none', 'set', 'buyout'].includes(b.plan_mode)) patch.plan_mode = b.plan_mode
  if ('set_slug' in b) patch.set_slug = b.set_slug ? String(b.set_slug) : null
  if ('hours' in b) patch.hours = b.hours != null ? Number(b.hours) : null
  if ('guests' in b) patch.guests = b.guests != null ? Number(b.guests) : null
  if ('shoot_date' in b) patch.shoot_date = b.shoot_date || null
  if ('start_hour' in b) patch.start_hour = b.start_hour != null ? Number(b.start_hour) : null
  if ('estimated_cost' in b) patch.estimated_cost = b.estimated_cost != null ? Number(b.estimated_cost) : null
  if (Array.isArray(b.equipment)) {
    patch.equipment = b.equipment.filter((e: { id?: unknown }) => e && e.id).map((e: { id: unknown; name?: unknown; rate?: unknown; quantity?: unknown }) => ({
      id: String(e.id), name: String(e.name ?? '').slice(0, 80), rate: Number(e.rate) || 0, quantity: Math.max(1, Number(e.quantity) || 1),
    })).slice(0, 30)
  }

  const { error } = await service.from('castings').update(patch).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/castings/<id> — author removes the casting.
export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: c } = await service.from('castings').select('author_id').eq('id', params.id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (c.author_id !== user.id) return NextResponse.json({ error: 'Not your casting.' }, { status: 403 })
  const { error } = await service.from('castings').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
