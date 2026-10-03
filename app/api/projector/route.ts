// GET /api/projector?key=<KIOSK_KEY>&v=<current name>
// What the wall should show. Returns { v } only when nothing changed, so the
// 5-second poll costs one storage list and nothing else.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { listProjectorFiles, projectorKeyOk, projectorUploadCode, PROJECTOR_BUCKET, PROJECTOR_DIR } from '@/lib/projector'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(req: NextRequest) {
  const u = new URL(req.url)
  if (!projectorKeyOk(u.searchParams.get('key'))) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const uploadUrl = `${u.origin}/projector/upload?c=${projectorUploadCode(process.env.KIOSK_KEY!)}`

  let names: string[]
  try { names = await listProjectorFiles() }
  catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }

  const newest = names[0] ?? null
  if (!newest) return NextResponse.json({ v: null, uploadUrl })
  if (u.searchParams.get('v') === newest) return NextResponse.json({ v: newest, same: true, uploadUrl })

  const { data, error } = await supabaseAdmin().storage.from(PROJECTOR_BUCKET)
    .createSignedUrl(`${PROJECTOR_DIR}/${newest}`, 12 * 3600)
  if (error || !data) return NextResponse.json({ error: error?.message || 'sign failed' }, { status: 500 })
  return NextResponse.json({ v: newest, url: data.signedUrl, uploadUrl })
}
