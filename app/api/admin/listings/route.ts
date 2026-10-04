// /api/admin/listings — every Production Services listing for Teddy to review.
//   GET                          → { listings } with vendor, tags, open report counts/reasons
//   PATCH { id, action }         → 'hold' (pull it) | 'restore' (clear hold + dismiss open reports) | 'dismiss' (keep it live, dismiss reports)
//   DELETE { id }                → delete the listing and its photos
// Writes are .select()-verified: an update that matched nothing is not success.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminAuthed } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: rows, error } = await db.from('service_listings')
    .select('id, user_id, category, title, details, rate, photos, tags, active, review_hold, review_hold_reason, created_at, updated_at')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const ids = Array.from(new Set((rows ?? []).map(r => r.user_id)))
  const lids = (rows ?? []).map(r => r.id)
  const [{ data: profs }, { data: reps, error: rErr }] = await Promise.all([
    ids.length ? db.from('customer_profiles').select('id, full_name').in('id', ids) : Promise.resolve({ data: [] as any[] }),
    lids.length ? db.from('listing_reports').select('listing_id, reason, note').eq('status', 'open').in('listing_id', lids) : Promise.resolve({ data: [] as any[], error: null }),
  ])
  if (rErr) return NextResponse.json({ error: rErr.message }, { status: 500 })
  const name = new Map((profs ?? []).map((p: any) => [p.id, p.full_name || '(no name)']))
  const reports = new Map<string, { reason: string; note: string | null }[]>()
  for (const r of (reps ?? []) as any[]) { const a = reports.get(r.listing_id) ?? []; a.push({ reason: r.reason, note: r.note }); reports.set(r.listing_id, a) }
  return NextResponse.json({
    listings: (rows ?? []).map(r => ({ ...r, vendor_name: name.get(r.user_id) ?? '(unknown)', reports: reports.get(r.id) ?? [] })),
  })
}

export async function PATCH(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, action } = await req.json().catch(() => ({} as any))
  if (!id || !['hold', 'restore', 'dismiss'].includes(action)) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  const now = new Date().toISOString()
  const patch = action === 'hold'
    ? { review_hold: true, review_hold_reason: 'admin' }
    : { review_hold: false, review_hold_reason: null, reviewed_at: now }
  const { data, error } = await db.from('service_listings').update(patch).eq('id', id).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })
  if (action !== 'hold') {
    await db.from('listing_reports').update({ status: 'dismissed', resolved_at: now }).eq('listing_id', id).eq('status', 'open')
  } else {
    await db.from('listing_reports').update({ status: 'actioned', resolved_at: now }).eq('listing_id', id).eq('status', 'open')
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json().catch(() => ({} as any))
  if (!id) return NextResponse.json({ error: 'Bad request' }, { status: 400 })
  const { data, error } = await db.from('service_listings').delete().eq('id', id).select('photos')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })
  const paths = ((data[0].photos ?? []) as string[]).map(u => { const m = u.match(/\/object\/public\/portfolios\/(.+)$/); return m ? decodeURIComponent(m[1]) : null }).filter(Boolean) as string[]
  if (paths.length) await db.storage.from('portfolios').remove(paths)
  return NextResponse.json({ ok: true })
}
