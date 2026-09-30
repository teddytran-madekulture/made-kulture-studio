// /api/admin/featured-editorial — Website Editor → Featured Editorial.
//   GET  → { config: { items: [...] } } as saved
//   PUT  { items: [...] } → sanitised, saved, returned
//   POST multipart { file } → uploads ONE photo to the public 'site' bucket
//        under editorial/ and returns its URL (the editor adds it to the list;
//        nothing is live until PUT). The browser shrinks photos first — every
//        upload here goes through a Vercel function capped at 4.5 MB.
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { parseStoredConfig, sanitizeConfig } from '@/lib/featured-editorial'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabaseAdmin().from('site_settings').select('value').eq('key', 'featured_editorial').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ config: parseStoredConfig(data?.value) })
}

export async function PUT(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Expected JSON' }, { status: 400 }) }
  const config = sanitizeConfig({ ...body, updatedAt: new Date().toISOString() })
  const { data, error } = await supabaseAdmin().from('site_settings')
    .upsert({ key: 'featured_editorial', value: JSON.stringify(config), updated_at: new Date().toISOString() }, { onConflict: 'key' })
    .select('key')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // supabase-js does not throw when nothing is written — check it did.
  if (!data?.length) return NextResponse.json({ error: 'Not saved (no row written).' }, { status: 500 })
  return NextResponse.json({ config })
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'Expected multipart form-data' }, { status: 400 }) }
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No photo attached' }, { status: 400 })
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return NextResponse.json({ error: 'Use a JPG, PNG or WebP photo' }, { status: 400 })
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `editorial/${randomUUID()}.${ext}`
  const sb = supabaseAdmin()
  const { error } = await sb.storage.from('site').upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ url: sb.storage.from('site').getPublicUrl(path).data.publicUrl })
}
