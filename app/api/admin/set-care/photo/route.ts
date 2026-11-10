// POST   /api/admin/set-care/photo  (multipart: entryId, photo) — admin only.
// DELETE /api/admin/set-care/photo  { entryId, path }
// One photo per request: a Vercel function caps the request body at 4.5 MB, so
// the page shrinks each photo to a ~1600px JPEG (lib/shrink-image) first.
// Upload first, then attach the path — a failed upload never leaves the row
// pointing at a file that does not exist. (Same shape as incidents/photo.)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { isAdminAuthed } from '@/lib/admin-auth'
import { MAX_CARE_PHOTOS } from '@/lib/set-care'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const BUCKET = 'set-care'
const OK = new Set(['image/jpeg', 'image/png', 'image/webp'])

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const form = await req.formData().catch(() => null)
  const entryId = String(form?.get('entryId') ?? '')
  const f = form?.get('photo')
  if (!entryId || !(f instanceof File) || !f.size) return NextResponse.json({ error: 'Missing photo.' }, { status: 400 })
  if (!OK.has(f.type)) return NextResponse.json({ error: `Unsupported image type: ${f.type || 'unknown'}` }, { status: 400 })
  if (f.size > 4 * 1024 * 1024) return NextResponse.json({ error: 'Photo is over 4 MB.' }, { status: 400 })

  const { data: e, error } = await db.from('set_care_entries').select('id, set_id, photo_paths').eq('id', entryId).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!e) return NextResponse.json({ error: 'Entry not found.' }, { status: 404 })
  const existing: string[] = e.photo_paths ?? []
  if (existing.length >= MAX_CARE_PHOTOS) return NextResponse.json({ error: `Up to ${MAX_CARE_PHOTOS} photos per entry.` }, { status: 400 })

  const ext = f.type === 'image/png' ? 'png' : f.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${e.set_id}/${entryId}/${randomBytes(6).toString('hex')}.${ext}`
  const { error: upErr } = await db.storage.from(BUCKET).upload(path, Buffer.from(await f.arrayBuffer()), { contentType: f.type, upsert: false })
  if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })

  const { data: upd, error: uErr } = await db.from('set_care_entries')
    .update({ photo_paths: [...existing, path], updated_at: new Date().toISOString() }).eq('id', entryId).select('id')
  if (uErr || !upd?.length) {
    await db.storage.from(BUCKET).remove([path]).catch(() => {})
    return NextResponse.json({ error: uErr?.message || 'Could not attach the photo.' }, { status: 500 })
  }
  const { data: signed } = await db.storage.from(BUCKET).createSignedUrl(path, 600)
  return NextResponse.json({ ok: true, path, url: signed?.signedUrl ?? null })
}

export async function DELETE(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const entryId = String(body.entryId ?? ''), path = String(body.path ?? '')
  if (!entryId || !path) return NextResponse.json({ error: 'Missing photo.' }, { status: 400 })
  const { data: e, error } = await db.from('set_care_entries').select('id, photo_paths').eq('id', entryId).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!e) return NextResponse.json({ error: 'Entry not found.' }, { status: 404 })
  const existing: string[] = e.photo_paths ?? []
  if (!existing.includes(path)) return NextResponse.json({ error: 'That photo is not on this entry.' }, { status: 404 })
  const { data: upd, error: uErr } = await db.from('set_care_entries')
    .update({ photo_paths: existing.filter(p => p !== path), updated_at: new Date().toISOString() }).eq('id', entryId).select('id')
  if (uErr || !upd?.length) return NextResponse.json({ error: uErr?.message || 'Could not remove the photo.' }, { status: 500 })
  const { error: rmErr } = await db.storage.from(BUCKET).remove([path])
  if (rmErr) console.error('[set-care] storage remove failed (orphan file left)', rmErr)
  return NextResponse.json({ ok: true })
}
