import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ⚠️ The extension comes from the MIME TYPE, never the filename, and an
// unrecognised image type falls back to jpg. A video MUST NOT take that
// fallback — stored as .jpg it would upload fine, save fine, and simply never
// play, which is exactly the fail-while-reporting-success shape this project
// keeps getting bitten by. So an unknown video/* is REFUSED loudly instead.
// Keep VIDEO_EXT in step with the accept= attribute on the upload control in
// components/SetsCatalogManager.tsx.
const IMAGE_EXT: Record<string, string> = { 'image/png': 'png', 'image/webp': 'webp', 'image/jpeg': 'jpg' }
const VIDEO_EXT: Record<string, string> = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' }

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// POST /api/admin/sets/upload — multipart 'files'; uploads to the public
// 'site' storage bucket under sets/<uuid>/ and returns the public URLs
// (first = hero). Mirrors /api/admin/props/upload so the Sets manager shares
// the same upload machinery as the props/equipment catalogs.
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'Expected multipart form-data' }, { status: 400 }) }

  const files = form.getAll('files').filter(f => f instanceof File) as File[]
  if (!files.length) return NextResponse.json({ error: 'No files' }, { status: 400 })

  const folder = randomUUID()
  const urls: string[] = []
  for (let i = 0; i < files.length; i++) {
    const f = files[i]
    const buf = Buffer.from(await f.arrayBuffer())
    const isVideo = (f.type || '').startsWith('video/')
    if (isVideo && !VIDEO_EXT[f.type]) {
      return NextResponse.json({ error: `Unsupported video type ${f.type} — export an H.264 MP4` }, { status: 400 })
    }
    const ext = isVideo ? VIDEO_EXT[f.type] : (IMAGE_EXT[f.type] ?? 'jpg')
    const path = `sets/${folder}/${i + 1}.${ext}`
    const { error } = await supabase.storage.from('site').upload(path, buf, {
      contentType: f.type || 'image/jpeg', upsert: true,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const { data } = supabase.storage.from('site').getPublicUrl(path)
    urls.push(data.publicUrl)
  }
  return NextResponse.json({ urls })
}
