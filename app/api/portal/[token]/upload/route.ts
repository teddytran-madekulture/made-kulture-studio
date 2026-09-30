// POST /api/portal/[token]/upload — one photo from the guest's camera roll.
// The phone page shrinks it to ≤1600px JPEG before sending, which keeps every
// upload far under Vercel's 4.5 MB request-body ceiling.
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { loadPortalByToken, isLive, countItems, PORTAL_BUCKET, PORTAL_MAX_ITEMS } from '@/lib/portal'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const p = await loadPortalByToken(params.token)
  if (!p) return NextResponse.json({ error: 'This link isn’t valid.' }, { status: 404 })
  if (!isLive(p.booking)) return NextResponse.json({ error: 'This session has ended.' }, { status: 410 })

  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'No photo received.' }, { status: 400 })
  const ext = TYPES[(file as File).type]
  // Images only — no video, no audio, nothing the tablet could "play".
  if (!ext) return NextResponse.json({ error: 'Photos only (JPG, PNG or WebP).' }, { status: 400 })
  if ((file as File).size > 4 * 1024 * 1024) return NextResponse.json({ error: 'That photo is too large.' }, { status: 400 })
  if (await countItems(p.portal.id) >= PORTAL_MAX_ITEMS) {
    return NextResponse.json({ error: `The board is full (${PORTAL_MAX_ITEMS} pictures). Remove some first.` }, { status: 400 })
  }

  const db = supabaseAdmin()
  const path = `${p.portal.id}/${randomUUID()}.${ext}`
  const bytes = Buffer.from(await (file as File).arrayBuffer())
  const { error: upErr } = await db.storage.from(PORTAL_BUCKET).upload(path, bytes, { contentType: (file as File).type, upsert: false })
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  const { data, error } = await db.from('portal_items').insert({ portal_id: p.portal.id, kind: 'upload', storage_path: path }).select('id')
  if (error || !data?.length) {
    await db.storage.from(PORTAL_BUCKET).remove([path])
    return NextResponse.json({ error: error?.message || 'Could not save the photo.' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
