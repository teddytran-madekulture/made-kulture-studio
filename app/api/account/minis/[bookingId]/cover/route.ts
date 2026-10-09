// POST   /api/account/minis/[bookingId]/cover  (multipart: photo) — set the cover photo
// DELETE /api/account/minis/[bookingId]/cover                     — remove it
// The page shrinks the photo first (lib/shrink-image); Vercel caps bodies at 4.5 MB.
import { NextRequest, NextResponse } from 'next/server'
import { randomBytes } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'
import { loadForOwner } from '@/lib/mini-sessions-server'

export const dynamic = 'force-dynamic'
const OK = new Set(['image/jpeg', 'image/png', 'image/webp'])
const BUCKET = 'mini-media'

async function owned(bookingId: string) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return { error: NextResponse.json({ error: 'Sign in first.' }, { status: 401 }) }
  const db = supabaseAdmin()
  const r = await loadForOwner(db, user, bookingId)
  if (!r.ok) return { error: NextResponse.json({ error: (r as any).error }, { status: (r as any).status }) }
  if (!r.mini) return { error: NextResponse.json({ error: 'Set up Mini Sessions first.' }, { status: 400 }) }
  return { db, mini: r.mini }
}

const pathOf = (url: string | null) => url?.split(`/${BUCKET}/`)[1] ?? null

export async function POST(req: NextRequest, { params }: { params: { bookingId: string } }) {
  const o = await owned(params.bookingId)
  if ('error' in o) return o.error
  const form = await req.formData().catch(() => null)
  const f = form?.get('photo')
  if (!(f instanceof File) || !f.size) return NextResponse.json({ error: 'Pick a photo.' }, { status: 400 })
  if (!OK.has(f.type)) return NextResponse.json({ error: 'Use a JPG, PNG or WebP photo.' }, { status: 400 })
  if (f.size > 4 * 1024 * 1024) return NextResponse.json({ error: 'That photo is too large.' }, { status: 400 })
  const ext = f.type === 'image/png' ? 'png' : f.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${o.mini.id}/${randomBytes(6).toString('hex')}.${ext}`
  const { error: upErr } = await o.db.storage.from(BUCKET).upload(path, Buffer.from(await f.arrayBuffer()), { contentType: f.type, upsert: false })
  if (upErr) return NextResponse.json({ error: `Upload failed: ${upErr.message}` }, { status: 500 })
  const url = o.db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
  const { data, error } = await o.db.from('mini_sessions').update({ cover_url: url, updated_at: new Date().toISOString() }).eq('id', o.mini.id).select('id')
  if (error || !data?.length) {
    await o.db.storage.from(BUCKET).remove([path]).catch(() => {})
    return NextResponse.json({ error: error?.message || 'Could not save the photo.' }, { status: 500 })
  }
  const old = pathOf(o.mini.cover_url)
  if (old) await o.db.storage.from(BUCKET).remove([old]).catch(() => {})
  return NextResponse.json({ ok: true, url })
}

export async function DELETE(_req: NextRequest, { params }: { params: { bookingId: string } }) {
  const o = await owned(params.bookingId)
  if ('error' in o) return o.error
  const { error } = await o.db.from('mini_sessions').update({ cover_url: null, updated_at: new Date().toISOString() }).eq('id', o.mini.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const old = pathOf(o.mini.cover_url)
  if (old) await o.db.storage.from(BUCKET).remove([old]).catch(() => {})
  return NextResponse.json({ ok: true })
}
