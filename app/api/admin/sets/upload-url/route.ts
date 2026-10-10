// POST /api/admin/sets/upload-url  { type, size } → { uploadUrl, publicUrl }
//
// For VIDEOS too big for /api/admin/sets/upload (a Vercel function caps the
// request body at 4.5 MB). The admin page PUTs the file straight to Supabase
// storage on this signed URL — same pattern as the projector wall — into the
// same public 'site' bucket, under sets/<uuid>/.
import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Keep in step with VIDEO_EXT in ../upload/route.ts. An unknown type is refused,
// never stored under a guessed extension (it would save fine and never play).
const VIDEO_EXT: Record<string, string> = { 'video/mp4': 'mp4', 'video/webm': 'webm', 'video/quicktime': 'mov' }
const SITE_VIDEO_MAX = 49 * 1024 * 1024   // Supabase's per-file ceiling on this plan is 50 MB

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({} as any))
  const ext = VIDEO_EXT[String(b.type || '')]
  if (!ext) return NextResponse.json({ error: 'Videos must be MP4, MOV or WebM — an H.264 MP4 plays everywhere.' }, { status: 400 })
  const size = Number(b.size)
  if (!(size > 0) || size > SITE_VIDEO_MAX) {
    return NextResponse.json({ error: `That video is ${(size / 1048576).toFixed(0)} MB — keep it under ${SITE_VIDEO_MAX / 1048576} MB. Export a shorter clip or 1080p H.264 MP4.` }, { status: 400 })
  }
  const path = `sets/${randomUUID()}/1.${ext}`
  const db = supabaseAdmin()
  const { data, error } = await db.storage.from('site').createSignedUploadUrl(path)
  if (error || !data) return NextResponse.json({ error: error?.message || 'Could not start the upload.' }, { status: 500 })
  return NextResponse.json({ uploadUrl: data.signedUrl, publicUrl: db.storage.from('site').getPublicUrl(path).data.publicUrl })
}
