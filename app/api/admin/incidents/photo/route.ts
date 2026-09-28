// POST /api/admin/incidents/photo  (multipart: incidentId, photo) — admin only.
// One photo per request: a Vercel function caps the request body at 4.5 MB, so
// the client downsizes to a ~1600px JPEG and sends them one at a time.
// Upload first, then append the path — a failed upload never leaves the row
// pointing at a file that does not exist.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { isAdminAuthed } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const OK = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'])
const MAX_PHOTOS = 8

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const form = await req.formData().catch(() => null)
  const incidentId = String(form?.get('incidentId') ?? '')
  const f = form?.get('photo')
  if (!incidentId || !(f instanceof File) || !f.size) return NextResponse.json({ error: 'Missing photo.' }, { status: 400 })
  if (!OK.has(f.type)) return NextResponse.json({ error: `Unsupported image type: ${f.type || 'unknown'}` }, { status: 400 })
  if (f.size > 4 * 1024 * 1024) return NextResponse.json({ error: 'Photo is over 4 MB.' }, { status: 400 })

  const { data: inc, error } = await db.from('customer_incidents').select('id, photo_urls').eq('id', incidentId).maybeSingle()
  if (error || !inc) return NextResponse.json({ error: 'Incident not found.' }, { status: 404 })
  const existing: string[] = Array.isArray(inc.photo_urls) ? inc.photo_urls : []
  if (existing.length >= MAX_PHOTOS) return NextResponse.json({ error: `Up to ${MAX_PHOTOS} photos per incident.` }, { status: 400 })

  const ext = f.type === 'image/png' ? 'png' : f.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${incidentId}/${randomBytes(6).toString('hex')}.${ext}`
  const { error: upErr } = await db.storage.from('incident-photos').upload(path, Buffer.from(await f.arrayBuffer()), { contentType: f.type, upsert: false })
  if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })

  const { data: upd, error: uErr } = await db.from('customer_incidents')
    .update({ photo_urls: [...existing, path] }).eq('id', incidentId).select('id')
  if (uErr || !upd?.length) {
    await db.storage.from('incident-photos').remove([path]).catch(() => {})
    return NextResponse.json({ error: uErr?.message || 'Could not attach the photo.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true, path })
}
