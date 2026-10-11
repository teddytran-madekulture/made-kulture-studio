// /api/admin/partners — partner links (migration 166), admin only.
//   GET                → partners + clicks, bookings, revenue, recent referred bookings
//   POST {name, code, email?, note?}  → create
//   PATCH {id, active?, name?, note?}
//   DELETE {id}        → removes the partner; bookings keep their partner_code
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminAuthed } from '@/lib/admin-auth'
import { findAuthUserIdByEmail } from '@/lib/auth-user'
import { cleanPartnerCode } from '@/lib/partners'
import { selectAll } from '@/lib/select-all'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: partners, error } = await db.from('partners')
    .select('id, code, name, owner_id, note, active, clicks, created_at').order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Every tagged booking row, all pages (a failed read is an error, never "0").
  const { data: rows, error: bErr } = await selectAll(() => db.from('bookings')
    .select('id, partner_code, status, total_amount, start_time, created_at, order_group, sets(name), customers(name)')
    .not('partner_code', 'is', null).order('created_at', { ascending: false }).order('id'))
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 })

  type Stat = { bookings: number; cancelled: number; revenue: number; recent: any[] }
  const stats: Record<string, Stat> = {}
  for (const r of (rows ?? []) as any[]) {
    const code = String(r.partner_code).toLowerCase()
    const s = stats[code] ?? (stats[code] = { bookings: 0, cancelled: 0, revenue: 0, recent: [] })
    const live = r.status !== 'cancelled' && r.status !== 'pending_payment'
    if (live) { s.bookings++; s.revenue += Number(r.total_amount) || 0 } else if (r.status === 'cancelled') s.cancelled++
    if (s.recent.length < 8) {
      const set = Array.isArray(r.sets) ? r.sets[0] : r.sets
      const cust = Array.isArray(r.customers) ? r.customers[0] : r.customers
      s.recent.push({ id: r.id, start_time: r.start_time, status: r.status, total: Number(r.total_amount) || 0, set: set?.name ?? 'Full studio', customer: cust?.name ?? '' })
    }
  }

  const owners: Record<string, string | null> = {}
  await Promise.all((partners ?? []).filter(p => p.owner_id).map(async p => {
    const { data } = await db.auth.admin.getUserById(p.owner_id!)
    owners[p.owner_id!] = data?.user?.email ?? null
  }))

  return NextResponse.json({
    partners: (partners ?? []).map(p => ({
      ...p,
      owner_email: p.owner_id ? owners[p.owner_id] ?? null : null,
      ...(stats[p.code.toLowerCase()] ?? { bookings: 0, cancelled: 0, revenue: 0, recent: [] }),
    })),
  })
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const name = String(body.name ?? '').trim().slice(0, 80)
  const code = cleanPartnerCode(body.code)
  if (!name) return NextResponse.json({ error: 'Give the partner a name.' }, { status: 400 })
  if (!code) return NextResponse.json({ error: 'Link code: 2–31 lowercase letters, numbers or dashes, e.g. neiljou' }, { status: 400 })

  let ownerId: string | null = null
  if (String(body.email ?? '').trim()) {
    try { ownerId = await findAuthUserIdByEmail(db, body.email) }
    catch (e: any) { return NextResponse.json({ error: `Could not look up that login: ${e.message}` }, { status: 500 }) }
    if (!ownerId) return NextResponse.json({ error: 'No website account uses that email. Leave it blank or have them sign up.' }, { status: 404 })
  }

  const { data, error } = await db.from('partners')
    .insert({ name, code, owner_id: ownerId, note: String(body.note ?? '').trim().slice(0, 300) })
    .select('id').single()
  if (error) {
    const dup = /duplicate|unique/i.test(error.message)
    return NextResponse.json({ error: dup ? 'That link code is taken.' : error.message }, { status: dup ? 409 : 500 })
  }
  return NextResponse.json({ id: data.id, code })
}

export async function PATCH(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const patch: Record<string, unknown> = {}
  if (typeof body.active === 'boolean') patch.active = body.active
  if (body.name !== undefined) patch.name = String(body.name).trim().slice(0, 80)
  if (body.note !== undefined) patch.note = String(body.note).trim().slice(0, 300)
  const { data, error } = await db.from('partners').update(patch).eq('id', body.id).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Partner not found.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const { data, error } = await db.from('partners').delete().eq('id', body.id).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Partner not found.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
