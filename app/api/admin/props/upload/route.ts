import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// POST /api/admin/props/upload — multipart 'files'; uploads to the public
// 'props' storage bucket and returns the public URLs (first = hero).
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
    const ext = (f.type === 'image/png') ? 'png' : 'jpg'
    const path = `uploads/${folder}/${i + 1}.${ext}`
    const { error } = await supabase.storage.from('props').upload(path, buf, {
      contentType: f.type || 'image/jpeg', upsert: true,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const { data } = supabase.storage.from('props').getPublicUrl(path)
    urls.push(data.publicUrl)
  }
  return NextResponse.json({ urls })
}
