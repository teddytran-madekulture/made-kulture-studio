// /api/admin/set-care — SET CARE (2026-11-10, migration 184). Admin only.
//   GET                    → { sets: [{ id, name, slug, photo_url, is_active, care_pool, counts, lastLog }] }
//   GET ?setId=            → { set, entries }  (photos as 10-minute signed URLs)
//   POST  { setId, kind, title?, fields, logDate? }   → create an entry
//   PATCH { id, title?, fields?, logDate? }           → edit an entry
//   PATCH { setId, carePool: boolean }                → turn the pool sections on/off for a set
//   DELETE { id }                                     → delete an entry and its photos
//
// ⚠️ supabase-js does not throw: every write reads `error` and `.select()`s the
// row back, so a write that matched nothing is never reported as saved. A failed
// read returns 500 — it must never render as an empty section.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminAuthed } from '@/lib/admin-auth'
import { CARE_KINDS, sectionFor, cleanCareFields, cleanCareTitle } from '@/lib/set-care'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const BUCKET = 'set-care'
const COLS = 'id, set_id, kind, title, fields, photo_paths, log_date, sort_order, created_at, updated_at'
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const bad = (error: string, status = 400) => NextResponse.json({ error }, { status })

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return bad('Unauthorized', 401)
  const setId = req.nextUrl.searchParams.get('setId')

  if (!setId) {
    const { data: sets, error } = await db.from('sets')
      .select('id, name, slug, photo_url, is_active, care_pool, sort_order')
      .order('is_active', { ascending: false }).order('sort_order', { ascending: true })
    if (error) return bad(error.message, 500)
    const { data: entries, error: eErr } = await db.from('set_care_entries').select('set_id, kind, log_date').limit(20000)
    if (eErr) return bad(eErr.message, 500)
    const by: Record<string, { counts: Record<string, number>; lastLog: string | null }> = {}
    for (const e of entries ?? []) {
      const s = (by[e.set_id] ||= { counts: {}, lastLog: null })
      s.counts[e.kind] = (s.counts[e.kind] || 0) + 1
      if (e.log_date && (!s.lastLog || e.log_date > s.lastLog)) s.lastLog = e.log_date
    }
    return NextResponse.json({
      sets: (sets ?? []).map((s: any) => ({ ...s, counts: by[s.id]?.counts ?? {}, lastLog: by[s.id]?.lastLog ?? null })),
    })
  }

  const { data: set, error: sErr } = await db.from('sets')
    .select('id, name, slug, photo_url, is_active, care_pool').eq('id', setId).maybeSingle()
  if (sErr) return bad(sErr.message, 500)
  if (!set) return bad('Set not found.', 404)
  const { data: rows, error } = await db.from('set_care_entries').select(COLS).eq('set_id', setId)
    .order('log_date', { ascending: false, nullsFirst: true })
    .order('sort_order', { ascending: true }).order('created_at', { ascending: true })
  if (error) return bad(error.message, 500)

  // Private bucket → one batched signed-URL call for every photo on the page.
  const allPaths = (rows ?? []).flatMap((r: any) => (Array.isArray(r.photo_paths) ? r.photo_paths : []))
  const urlOf: Record<string, string> = {}
  if (allPaths.length) {
    const { data: signed, error: uErr } = await db.storage.from(BUCKET).createSignedUrls(allPaths, 600)
    if (uErr) console.error('[set-care] signed URLs failed', uErr)
    for (const s of signed ?? []) if (s.path && s.signedUrl) urlOf[s.path] = s.signedUrl
  }
  const entries = (rows ?? []).map((r: any) => ({
    ...r,
    photos: (r.photo_paths ?? []).map((p: string) => ({ path: p, url: urlOf[p] ?? null })),
  }))
  return NextResponse.json({ set, entries })
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return bad('Unauthorized', 401)
  const body = await req.json().catch(() => ({}))
  const setId = String(body.setId ?? '')
  const kind = String(body.kind ?? '')
  const sec = sectionFor(kind)
  if (!setId) return bad('Missing set.')
  if (!sec || !CARE_KINDS.includes(kind as any)) return bad('Unknown section.')

  const title = cleanCareTitle(body.title)
  const fields = cleanCareFields(kind, body.fields)
  const row: any = { set_id: setId, kind, title: title || null, fields }
  if (sec.log) {
    if (!DATE_RE.test(String(body.logDate ?? ''))) return bad('Pick a date.')
    row.log_date = body.logDate
    if (!Object.keys(fields).length && !title) return bad('Add at least one detail.')
  } else {
    if (!title) return bad(`${sec.titleLabel || 'Title'} is required.`)
  }

  const { data, error } = await db.from('set_care_entries').insert(row).select(COLS)
  if (error || !data?.length) return bad(error?.message || 'Could not save.', 500)
  return NextResponse.json({ ok: true, entry: { ...data[0], photos: [] } })
}

export async function PATCH(req: NextRequest) {
  if (!isAdminAuthed(req)) return bad('Unauthorized', 401)
  const body = await req.json().catch(() => ({}))

  if (body.setId && typeof body.carePool === 'boolean') {
    const { data, error } = await db.from('sets').update({ care_pool: body.carePool }).eq('id', String(body.setId)).select('id, care_pool')
    if (error || !data?.length) return bad(error?.message || 'Set not found.', error ? 500 : 404)
    return NextResponse.json({ ok: true, care_pool: data[0].care_pool })
  }

  const id = String(body.id ?? '')
  if (!id) return bad('Missing entry.')
  const { data: cur, error: cErr } = await db.from('set_care_entries').select('id, kind').eq('id', id).maybeSingle()
  if (cErr) return bad(cErr.message, 500)
  if (!cur) return bad('Entry not found.', 404)
  const sec = sectionFor(cur.kind)!

  const upd: any = { updated_at: new Date().toISOString() }
  if (body.title !== undefined) {
    const t = cleanCareTitle(body.title)
    if (!t && !sec.log) return bad(`${sec.titleLabel || 'Title'} is required.`)
    upd.title = t || null
  }
  if (body.fields !== undefined) upd.fields = cleanCareFields(cur.kind, body.fields)
  if (body.logDate !== undefined && sec.log) {
    if (!DATE_RE.test(String(body.logDate))) return bad('Pick a date.')
    upd.log_date = body.logDate
  }

  const { data, error } = await db.from('set_care_entries').update(upd).eq('id', id).select(COLS)
  if (error || !data?.length) return bad(error?.message || 'Could not save.', 500)
  return NextResponse.json({ ok: true, entry: data[0] })
}

// Delete the row first, then its files: a failed storage delete leaves an
// orphan private file (harmless), never a row pointing at nothing.
export async function DELETE(req: NextRequest) {
  if (!isAdminAuthed(req)) return bad('Unauthorized', 401)
  const body = await req.json().catch(() => ({}))
  const id = String(body.id ?? '')
  if (!id) return bad('Missing entry.')
  const { data, error } = await db.from('set_care_entries').delete().eq('id', id).select('id, photo_paths')
  if (error) return bad(error.message, 500)
  if (!data?.length) return bad('Entry not found.', 404)
  const paths: string[] = data[0].photo_paths ?? []
  if (paths.length) {
    const { error: rmErr } = await db.storage.from(BUCKET).remove(paths)
    if (rmErr) console.error('[set-care] photo cleanup failed (orphan files left)', rmErr)
  }
  return NextResponse.json({ ok: true })
}
