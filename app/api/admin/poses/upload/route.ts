// POST /api/admin/poses/upload — the studio's own pose shots (FormData: file, category, set).
// The admin page shrinks the photo first (lib/shrink-image), so it's well under 4.5 MB.
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { POSE_BUCKET } from '@/lib/poses'
import { POSE_CATEGORY_KEYS } from '@/lib/pose-categories'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  const category = String(form?.get('category') || '')
  const setSlug = String(form?.get('set') || '') || null
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'No photo received.' }, { status: 400 })
  if (!POSE_CATEGORY_KEYS.has(category)) return NextResponse.json({ error: 'Pick a category.' }, { status: 400 })
  if (!/^image\/(jpeg|png|webp)$/.test((file as File).type)) return NextResponse.json({ error: 'Photos only.' }, { status: 400 })
  const db = supabaseAdmin()
  const path = `studio/${randomUUID()}.jpg`
  const { error: upErr } = await db.storage.from(POSE_BUCKET).upload(path, Buffer.from(await (file as File).arrayBuffer()), { contentType: (file as File).type })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  const { data, error } = await db.from('poses').insert({ category, source: 'studio', status: 'live', storage_path: path, set_slug: setSlug }).select('id')
  if (error || !data?.length) {
    await db.storage.from(POSE_BUCKET).remove([path])
    return NextResponse.json({ error: error?.message || 'Could not save.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
