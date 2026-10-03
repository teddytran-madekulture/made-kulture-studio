// Video on the projector wall (2026-10-03).
// A video won't fit through a Vercel function (4.5 MB body cap), so the phone
// PUTs it STRAIGHT to Supabase storage on a signed upload URL — the same
// pattern as June's email attachments.
//   POST  ?c=<code>  { type, size }  → { uploadUrl, name }   (start)
//   PATCH ?c=<code>  { name }        → removes every other file (finish)
// The wall shows the newest finished object, so a half-done upload never
// appears; PATCH just tidies the older one away.
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { listProjectorFiles, projectorCodeOk, removeProjectorFiles, PROJECTOR_BUCKET, PROJECTOR_DIR, PROJECTOR_VIDEO_MAX } from '@/lib/projector'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const TYPES: Record<string, string> = { 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' }

export async function POST(req: NextRequest) {
  if (!projectorCodeOk(new URL(req.url).searchParams.get('c'))) return NextResponse.json({ error: 'This link isn’t valid.' }, { status: 404 })
  const b = await req.json().catch(() => ({}))
  const ext = TYPES[String(b.type || '')]
  if (!ext) return NextResponse.json({ error: 'Videos must be MP4, MOV or WebM.' }, { status: 400 })
  if (!(Number(b.size) > 0) || Number(b.size) > PROJECTOR_VIDEO_MAX) {
    return NextResponse.json({ error: `Videos must be under ${PROJECTOR_VIDEO_MAX / 1048576} MB. Trim it or send a shorter clip.` }, { status: 400 })
  }
  const name = `${Date.now()}-${randomUUID().slice(0, 8)}.${ext}`
  const { data, error } = await supabaseAdmin().storage.from(PROJECTOR_BUCKET).createSignedUploadUrl(`${PROJECTOR_DIR}/${name}`)
  if (error || !data) return NextResponse.json({ error: error?.message || 'Could not start the upload.' }, { status: 500 })
  return NextResponse.json({ uploadUrl: data.signedUrl, name })
}

export async function PATCH(req: NextRequest) {
  if (!projectorCodeOk(new URL(req.url).searchParams.get('c'))) return NextResponse.json({ error: 'This link isn’t valid.' }, { status: 404 })
  const b = await req.json().catch(() => ({}))
  const name = String(b.name || '')
  try {
    const names = await listProjectorFiles()
    if (!names.includes(name)) return NextResponse.json({ error: 'The upload didn’t arrive.' }, { status: 400 })
    await removeProjectorFiles(names.filter(n => n !== name))
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
  return NextResponse.json({ ok: true })
}
