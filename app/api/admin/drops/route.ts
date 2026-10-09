// Admin — Set Drops (migration 155).
//   GET  → every drop with its pledges + progress, plus the set list (for "replaces room")
//   POST → create a drop. Creates the drop's OWN `sets` row, switched OFF until GO.

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { dropProgress, dropPhase, slugify, type SetDrop, type DropPledge } from '@/lib/set-drops'
import { invalidateSetCatalog } from '@/lib/set-catalog'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseAdmin()
  const { data: drops, error } = await db.from('set_drops').select('*').order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const ids = (drops ?? []).map((d: any) => d.id)
  const { data: pledges, error: pErr } = ids.length
    ? await db.from('set_drop_pledges').select('*').in('drop_id', ids).order('created_at', { ascending: true })
    : { data: [], error: null }
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
  const { data: sets, error: sErr } = await db.from('sets').select('id, slug, name, is_active, rate_per_hour').order('sort_order', { ascending: true })
  if (sErr) return NextResponse.json({ error: sErr.message }, { status: 500 })
  const { data: calls } = await db.from('open_calls').select('id, slug, title')

  // Which depositors have actually booked the drop's set (2026-10-09): matched
  // by account id or the booking's email, same identity rule as everywhere else.
  const setIds = (drops ?? []).map((d: any) => d.set_id).filter(Boolean)
  const { data: bks, error: bErr } = setIds.length
    ? await db.from('bookings').select('set_id, auth_user_id, start_time, end_time, customers ( email )').in('set_id', setIds).neq('status', 'cancelled')
    : { data: [], error: null }
  if (bErr) return NextResponse.json({ error: bErr.message }, { status: 500 })

  const out = (drops ?? []).map((d: SetDrop) => {
    const mine = (bks ?? []).filter((b: any) => b.set_id === d.set_id)
    const ps = ((pledges ?? []).filter((p: any) => p.drop_id === d.id) as DropPledge[]).map(p => {
      const em = (p.customer_email || '').toLowerCase()
      const hits = mine.filter((b: any) => (p.auth_user_id && b.auth_user_id === p.auth_user_id) || (em && (b.customers?.email || '').toLowerCase() === em))
      const hours = hits.reduce((h: number, b: any) => h + (Date.parse(b.end_time) - Date.parse(b.start_time)) / 3_600_000, 0)
      return { ...p, booked: { count: hits.length, hours: Math.round(hours * 10) / 10 } }
    })
    return { ...d, phase: dropPhase(d), progress: dropProgress(d, ps), pledges: ps }
  })
  return NextResponse.json({ drops: out, sets: sets ?? [], openCalls: calls ?? [] })
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({} as any))
  const name = String(body.name || '').trim()
  if (!name) return NextResponse.json({ error: 'Give the drop a name.' }, { status: 400 })
  const slug = slugify(String(body.slug || name))
  if (!slug) return NextResponse.json({ error: 'That name needs at least one letter or number.' }, { status: 400 })
  const db = supabaseAdmin()

  const { data: taken } = await db.from('set_drops').select('id').eq('slug', slug).maybeSingle()
  if (taken) return NextResponse.json({ error: `A drop called "${slug}" already exists.` }, { status: 409 })

  // The drop's own set. Inactive: nobody can book it until GO switches it on.
  const rate = Number(body.rate_per_hour) > 0 ? Number(body.rate_per_hour) : 40
  const { data: set, error: setErr } = await db.from('sets').insert({
    name, slug, rate_per_hour: rate, min_hours: 1, capacity: 5, features: [],
    is_active: false, category: 'standard', sort_order: 200,
    description: body.tagline ? String(body.tagline) : null,
  }).select('id').single()
  if (setErr || !set) {
    const msg = setErr?.code === '23505' ? `A set named "${name}" (or slug "${slug}") already exists — pick another name.` : (setErr?.message ?? 'Could not create the set.')
    return NextResponse.json({ error: msg }, { status: 409 })
  }
  invalidateSetCatalog()

  const { data: drop, error } = await db.from('set_drops').insert({
    name, slug, set_id: set.id, rate_per_hour: rate,
    tagline: body.tagline ? String(body.tagline) : null,
  }).select('*').single()
  if (error || !drop) {
    await db.from('sets').delete().eq('id', set.id)   // don't leave an orphan set behind
    return NextResponse.json({ error: error?.message ?? 'Could not create the drop.' }, { status: 500 })
  }
  return NextResponse.json({ drop })
}
