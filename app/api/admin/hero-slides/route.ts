// /api/admin/hero-slides — the Website Editor's "Hero banners" (home carousel).
//   GET  → every slide as saved, incl. switched-off and scheduled ones
//   PUT  { slides, intervalSec } → sanitised, saved, returned
//   POST multipart { file } → uploads one slide photo to the public 'site'
//        bucket and returns its URL (the slide itself is saved by the PUT)
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { parseStored, sanitize } from '@/lib/hero-slides'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// ⚠️ A Vercel function refuses request bodies over 4.5 MB, with no useful error.
// The editor crops and re-encodes before upload so a photo lands well under it;
// this guard just turns the rare miss into a readable message.
const MAX_BYTES = 4_400_000

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabaseAdmin().from('site_settings').select('value').eq('key', 'hero_slides').maybeSingle()
  // Loud, not empty — a failed read shown as "no slides" invites a save that wipes them.
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ config: parseStored(data?.value) })
}

export async function PUT(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Expected JSON' }, { status: 400 }) }
  const config = sanitize({ ...body, updatedAt: new Date().toISOString() })
  const { data, error } = await supabaseAdmin().from('site_settings')
    .upsert({ key: 'hero_slides', value: JSON.stringify(config), updated_at: new Date().toISOString() }, { onConflict: 'key' })
    .select('key')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Not saved (no row written).' }, { status: 500 })
  return NextResponse.json({ config })
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'Photo too large or not a form upload. Try a smaller photo.' }, { status: 400 }) }
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No photo attached' }, { status: 400 })
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) return NextResponse.json({ error: 'Use a JPG, PNG or WebP photo.' }, { status: 400 })
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'Photo is over 4.4 MB after cropping — try a smaller original.' }, { status: 413 })

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `hero-slides/${randomUUID()}.${ext}`
  const sb = supabaseAdmin()
  const { error } = await sb.storage.from('site').upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ url: sb.storage.from('site').getPublicUrl(path).data.publicUrl })
}
