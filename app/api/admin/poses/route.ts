// /api/admin/poses — the Pose Guide library + guest review queue.
//   GET ?status=pending|live|hidden|rejected&category=
//   POST { action: 'approve'|'reject'|'hide'|'show'|'delete', id }
//   POST { action: 'category', id, category }
//   POST { action: 'seed', category, query, count }   → Unsplash starter set
import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { shapePoses, seedFromStock, POSE_BUCKET } from '@/lib/poses'
import { POSE_CATEGORY_KEYS } from '@/lib/pose-categories'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseAdmin()
  const status = req.nextUrl.searchParams.get('status') || 'live'
  const category = req.nextUrl.searchParams.get('category')
  let q = db.from('poses')
    .select('id, category, source, status, image_url, storage_path, width, height, credit_name, set_slug, consent_rights, consent_people, created_at')
    .eq('status', status).order('created_at', { ascending: false }).limit(300)
  if (category) q = q.eq('category', category)
  const { data, error } = await q
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = (data ?? []) as any[]
  const shaped = await shapePoses(rows)
  const byId = new Map(rows.map(r => [r.id, r]))
  const { data: counts } = await db.from('poses').select('status')
  const tally: Record<string, number> = {}
  for (const c of (counts ?? []) as any[]) tally[c.status] = (tally[c.status] ?? 0) + 1
  return NextResponse.json({
    poses: shaped.map(p => ({ ...p, status: byId.get(p.id)?.status, consentRights: byId.get(p.id)?.consent_rights, consentPeople: byId.get(p.id)?.consent_people, createdAt: byId.get(p.id)?.created_at })),
    counts: tally,
    stockReady: !!process.env.UNSPLASH_ACCESS_KEY,
  })
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseAdmin()
  const body = await req.json().catch(() => ({} as any))
  const action = String(body.action || '')

  if (action === 'seed') {
    const category = String(body.category || '')
    if (!POSE_CATEGORY_KEYS.has(category)) return NextResponse.json({ error: 'Pick a category.' }, { status: 400 })
    const query = String(body.query || '').trim()
    if (!query) return NextResponse.json({ error: 'Enter a search.' }, { status: 400 })
    const res = await seedFromStock(category, query, Number(body.count) || 20)
    if (!res.ok) return NextResponse.json({ error: (res as any).error }, { status: 400 })
    return NextResponse.json({ ok: true, added: (res as any).added })
  }

  const id = String(body.id || '')
  if (!/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: 'Unknown pose.' }, { status: 400 })

  if (action === 'category') {
    if (!POSE_CATEGORY_KEYS.has(String(body.category))) return NextResponse.json({ error: 'Unknown category.' }, { status: 400 })
    const { data, error } = await db.from('poses').update({ category: body.category }).eq('id', id).select('id')
    if (error || !data?.length) return NextResponse.json({ error: error?.message || 'Pose not found.' }, { status: 404 })
    return NextResponse.json({ ok: true })
  }

  if (action === 'delete') {
    const { data: row } = await db.from('poses').select('storage_path').eq('id', id).maybeSingle()
    if ((row as any)?.storage_path) await db.storage.from(POSE_BUCKET).remove([(row as any).storage_path])
    const { error } = await db.from('poses').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  const to: Record<string, string> = { approve: 'live', reject: 'rejected', hide: 'hidden', show: 'live' }
  if (!to[action]) return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  const { data, error } = await db.from('poses')
    .update({ status: to[action], ...(action === 'approve' || action === 'reject' ? { reviewed_at: new Date().toISOString() } : {}) })
    .eq('id', id).select('id')
  // ⚠️ supabase-js doesn't throw — no row back means nothing changed.
  if (error || !data?.length) return NextResponse.json({ error: error?.message || 'Pose not found.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
