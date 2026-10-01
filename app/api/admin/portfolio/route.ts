import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/admin/portfolio — every member portfolio image, newest first, with
// the member's name attached. Used by the admin content-moderation page.
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: imgs, error } = await service
    .from('portfolio_images')
    .select('id, user_id, url, is_mature, hidden, explore_hidden, explore_hidden_reason, reviewed_at, created_at')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Open member reports, grouped per image. Reporter ids are NOT sent to the
  // page — Teddy sees how many and why, never who.
  const { data: reps, error: repErr } = await service
    .from('portfolio_reports').select('image_id, reason, note, created_at').eq('status', 'open')
  if (repErr) return NextResponse.json({ error: repErr.message }, { status: 500 })
  const reports: Record<string, { reason: string; note: string | null; created_at: string }[]> = {}
  for (const r of reps ?? []) (reports[r.image_id] ??= []).push({ reason: r.reason, note: r.note, created_at: r.created_at })

  const ids = [...new Set((imgs ?? []).map(i => i.user_id))]
  const names: Record<string, string> = {}
  if (ids.length) {
    const { data: profs } = await service
      .from('customer_profiles').select('id, full_name').in('id', ids)
    for (const p of profs ?? []) names[p.id] = p.full_name ?? ''
  }

  const images = (imgs ?? []).map(i => ({
    id: i.id,
    user_id: i.user_id,
    member: names[i.user_id] || '(unknown)',
    url: i.url,
    is_mature: i.is_mature,
    hidden: i.hidden,
    explore_hidden: i.explore_hidden,
    explore_hidden_reason: i.explore_hidden_reason,
    created_at: i.created_at,
    reports: reports[i.id] ?? [],
  }))
  return NextResponse.json({ images })
}

// PATCH /api/admin/portfolio — { id, ...one or more of }:
//   hidden: boolean          archive / restore everywhere
//   explore_hidden: boolean  off / back on the Explore feed only
//   is_mature: boolean       the 18+ label (blurred behind a reveal on profiles)
//   keep: true               reviewed, it's fine: dismiss open reports and, if
//                            reports pulled it off Explore, put it back
// Any action resolves the photo's open reports so the Flagged list clears.
export async function PATCH(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({} as any))
  const id = body.id
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const patch: Record<string, unknown> = { reviewed_at: new Date().toISOString() }
  if (typeof body.hidden === 'boolean') patch.hidden = body.hidden
  if (typeof body.is_mature === 'boolean') patch.is_mature = body.is_mature
  if (typeof body.explore_hidden === 'boolean') {
    patch.explore_hidden = body.explore_hidden
    patch.explore_hidden_reason = body.explore_hidden ? 'admin' : null
  }
  if (body.keep === true) {
    const { data: cur } = await service.from('portfolio_images').select('explore_hidden_reason').eq('id', id).maybeSingle()
    if (cur?.explore_hidden_reason === 'reports') { patch.explore_hidden = false; patch.explore_hidden_reason = null }
  }
  if (Object.keys(patch).length === 1 && body.keep !== true) {
    return NextResponse.json({ error: 'Nothing to change.' }, { status: 400 })
  }

  const { data: upd, error } = await service.from('portfolio_images').update(patch).eq('id', id)
    .select('id, is_mature, hidden, explore_hidden, explore_hidden_reason')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!upd?.length) return NextResponse.json({ error: 'Image not found.' }, { status: 404 })

  const { error: repErr } = await service.from('portfolio_reports')
    .update({ status: body.keep === true ? 'dismissed' : 'actioned', resolved_at: new Date().toISOString() })
    .eq('image_id', id).eq('status', 'open')
  if (repErr) return NextResponse.json({ error: repErr.message }, { status: 500 })

  return NextResponse.json({ ok: true, image: upd[0] })
}

// DELETE /api/admin/portfolio — { id } — permanently remove an image (row + file).
export async function DELETE(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { data: img } = await service
    .from('portfolio_images').select('url').eq('id', id).maybeSingle()

  const { error } = await service.from('portfolio_images').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Best-effort storage cleanup.
  const path = img?.url?.split('/portfolios/')[1]?.split('?')[0]
  if (path) await service.storage.from('portfolios').remove([path]).catch(() => {})

  return NextResponse.json({ ok: true })
}
