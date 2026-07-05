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

// GET /api/admin/site-images — current overrides { slug: url }
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase.from('site_images').select('slug, url')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const images: Record<string, string> = {}
  for (const row of data || []) if (row.slug && row.url) images[row.slug] = row.url
  return NextResponse.json({ images })
}

// POST /api/admin/site-images — multipart 'slug' + 'file'; uploads to the public
// 'site' bucket and upserts the row. Returns the new public URL.
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'Expected multipart form-data' }, { status: 400 }) }

  const slug = String(form.get('slug') || '')
  if (!SITE_IMAGE_SLUGS.includes(slug)) return NextResponse.json({ error: 'Unknown slot' }, { status: 400 })

  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const buf = Buffer.from(await file.arrayBuffer())
  const ext = (file.type === 'image/png') ? 'png' : 'jpg'
  // New folder each upload so the public URL changes → CDN + browsers refetch.
  const path = `${slug}/${randomUUID()}.${ext}`
  const { error: upErr } = await supabase.storage.from('site').upload(path, buf, {
    contentType: file.type || 'image/jpeg', upsert: true,
  })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  const { data: pub } = supabase.storage.from('site').getPublicUrl(path)
  const url = pub.publicUrl

  const { error: dbErr } = await supabase.from('site_images')
    .upsert({ slug, url, updated_at: new Date().toISOString() }, { onConflict: 'slug' })
  if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

  return NextResponse.json({ slug, url })
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
