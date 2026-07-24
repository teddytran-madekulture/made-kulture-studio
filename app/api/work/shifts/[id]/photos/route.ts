import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'
import { assertCanAddPhoto, recordShiftPhoto, deleteShiftPhoto, SHIFT_MEDIA_BUCKET } from '@/lib/shifts'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const MAX_BYTES = 12 * 1024 * 1024 // 12 MB per photo

// POST /api/work/shifts/[id]/photos — multipart: 'file' (image) + optional 'caption'.
// Uploads the closeout photo to the private shift-media bucket and records it,
// attributed + timestamped to the worker who claimed the shift.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const gate = await assertCanAddPhoto(user.id, params.id)
  if (!gate.ok) return NextResponse.json({ error: gate.error }, { status: 400 })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'Expected multipart form-data' }, { status: 400 }) }
  const file = form.get('file')
  const caption = String(form.get('caption') ?? '')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No photo' }, { status: 400 })
  if (!file.type.startsWith('image/')) return NextResponse.json({ error: 'Photos only' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'That photo is too large (max 12 MB).' }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${params.id}/${randomUUID()}.${ext}`
  const { error: upErr } = await supabaseAdmin().storage.from(SHIFT_MEDIA_BUCKET)
    .upload(path, buf, { contentType: file.type || 'image/jpeg', upsert: false })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const rec = await recordShiftPhoto(params.id, gate.workerId!, path, caption)
  if (!rec.ok) {
    await supabaseAdmin().storage.from(SHIFT_MEDIA_BUCKET).remove([path]) // don't orphan the object
    return NextResponse.json({ error: rec.error }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}

// DELETE /api/work/shifts/[id]/photos?photoId=... — remove a closeout photo you
// added (only before clocking out).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const photoId = req.nextUrl.searchParams.get('photoId')
  if (!photoId) return NextResponse.json({ error: 'photoId required' }, { status: 400 })
  const r = await deleteShiftPhoto(user.id, params.id, photoId)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ success: true })
}
