// POST /api/admin/gigs/upload — one cover image for a gig (multipart 'file').
// Stored in the public 'site' bucket under gigs/<uuid>.<ext>; returns its URL.
// Images only. The admin form shrinks the photo in the browser first, because
// a serverless request body caps at 4.5 MB (see CLAUDE.md, "THE UPLOAD CEILING").
import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'Expected multipart form-data' }, { status: 400 }) }
  const f = form.get('file')
  if (!(f instanceof File)) return NextResponse.json({ error: 'No file' }, { status: 400 })
  const ext = EXT[f.type]
  if (!ext) return NextResponse.json({ error: 'Use a JPG, PNG or WebP image.' }, { status: 400 })
  if (f.size > 4 * 1024 * 1024) return NextResponse.json({ error: 'That image is over 4 MB. Try a smaller one.' }, { status: 400 })
  const path = `gigs/${randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('site').upload(path, Buffer.from(await f.arrayBuffer()), { contentType: f.type, upsert: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ url: supabase.storage.from('site').getPublicUrl(path).data.publicUrl })
}
