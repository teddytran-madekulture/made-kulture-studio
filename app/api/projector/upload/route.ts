// POST   /api/projector/upload?c=<code>  — put one image on the wall
// DELETE /api/projector/upload?c=<code>  — clear the wall (QR comes back)
// The phone shrinks to ≤2400px JPEG first, far under Vercel's 4.5 MB body cap.
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { listProjectorFiles, projectorCodeOk, removeProjectorFiles, PROJECTOR_BUCKET, PROJECTOR_DIR } from '@/lib/projector'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export async function POST(req: NextRequest) {
  if (!projectorCodeOk(new URL(req.url).searchParams.get('c'))) return NextResponse.json({ error: 'This link isn’t valid.' }, { status: 404 })
  const form = await req.formData().catch(() => null)
  const file = form?.get('file')
  if (!file || typeof file === 'string') return NextResponse.json({ error: 'No image received.' }, { status: 400 })
  const ext = TYPES[(file as File).type]
  if (!ext) return NextResponse.json({ error: 'Images only (JPG, PNG or WebP).' }, { status: 400 })
  if ((file as File).size > 4 * 1024 * 1024) return NextResponse.json({ error: 'That image is too large.' }, { status: 400 })

  const name = `${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`
  const bytes = Buffer.from(await (file as File).arrayBuffer())
  const { error } = await supabaseAdmin().storage.from(PROJECTOR_BUCKET)
    .upload(`${PROJECTOR_DIR}/${name}`, bytes, { contentType: (file as File).type, upsert: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Keep only the new one. Non-fatal: a leftover file is harmless, the newest wins.
  try { await removeProjectorFiles((await listProjectorFiles()).filter(n => n !== name)) } catch (e) { console.error('[projector] cleanup', e) }
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  if (!projectorCodeOk(new URL(req.url).searchParams.get('c'))) return NextResponse.json({ error: 'This link isn’t valid.' }, { status: 404 })
  try { await removeProjectorFiles(await listProjectorFiles()) }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
  return NextResponse.json({ ok: true })
}
