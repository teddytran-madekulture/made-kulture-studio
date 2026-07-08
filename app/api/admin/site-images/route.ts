import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { SITE_IMAGE_SLUGS } from '@/lib/site-images'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Upload a File to the public 'site' bucket under <slug>/ and return its URL.
async function uploadToBucket(slug: string, file: File): Promise<string> {
  const buf = Buffer.from(await file.arrayBuffer())
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `${slug}/${randomUUID()}.${ext}`
  const { error } = await supabase.storage.from('site').upload(path, buf, {
    contentType: file.type || 'image/jpeg', upsert: true,
  })
  if (error) throw new Error(error.message)
  return supabase.storage.from('site').getPublicUrl(path).data.publicUrl
}

// GET /api/admin/site-images — current overrides.
//   images: { slug: url }                      (the displayed/cropped photo)
//   meta:   { slug: { original_url, focal } }  (for re-crop + focal controls)
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase.from('site_images').select('slug, url, original_url, focal')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const images: Record<string, string> = {}
  const meta: Record<string, { original_url: string | null; focal: string | null }> = {}
  for (const row of data || []) {
    if (!row.slug) continue
    if (row.url) images[row.slug] = row.url
    meta[row.slug] = { original_url: row.original_url ?? null, focal: row.focal ?? null }
  }
  return NextResponse.json({ images, meta })
}

// POST /api/admin/site-images — multipart. Three uses, in any combination:
//   • new photo:  slug + file (cropped) [+ original (full photo)]
//   • re-crop:    slug + file (cropped)         (original already stored)
//   • focal only: slug + focal ('50% 100%')     (no file)
// We read the existing row and merge so a focal-only save doesn't wipe the photo.
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'Expected multipart form-data' }, { status: 400 }) }

  const slug = String(form.get('slug') || '')
  if (!SITE_IMAGE_SLUGS.includes(slug)) return NextResponse.json({ error: 'Unknown slot' }, { status: 400 })

  const file = form.get('file')
  const original = form.get('original')
  const focalRaw = form.get('focal')
  const focal = typeof focalRaw === 'string' ? focalRaw.trim() : null

  if (!(file instanceof File) && !(original instanceof File) && focal === null) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  try {
    const { data: existing } = await supabase
      .from('site_images').select('url, original_url, focal').eq('slug', slug).maybeSingle()

    const row: Record<string, unknown> = {
      slug,
      url: existing?.url ?? null,
      original_url: existing?.original_url ?? null,
      focal: existing?.focal ?? null,
      updated_at: new Date().toISOString(),
    }

    if (file instanceof File)     row.url = await uploadToBucket(slug, file)
    if (original instanceof File) row.original_url = await uploadToBucket(slug, original)
    if (focal !== null)           row.focal = focal || null

    if (!row.url) return NextResponse.json({ error: 'Upload a photo before adjusting it' }, { status: 400 })

    const { error: dbErr } = await supabase.from('site_images').upsert(row, { onConflict: 'slug' })
    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

    return NextResponse.json({ slug, url: row.url, original_url: row.original_url, focal: row.focal })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Upload failed' }, { status: 500 })
  }
}

// DELETE /api/admin/site-images?slug=hero — reset a slot to its built-in default
export async function DELETE(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const slug = req.nextUrl.searchParams.get('slug') || ''
  if (!SITE_IMAGE_SLUGS.includes(slug)) return NextResponse.json({ error: 'Unknown slot' }, { status: 400 })
  const { error } = await supabase.from('site_images').delete().eq('slug', slug)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
