import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const maxDuration = 60

const MODEL = 'gpt-image-1'
const PROMPT = 'Remove the background and place this exact object on a clean, evenly lit, pure white studio background. Keep the object itself unchanged, centered, photorealistic. Do not add any new objects, text, or props.'

// POST /api/admin/props/edit-image — multipart 'file'.
// Sends the photo to OpenAI's image edit API and returns the edited image (PNG base64).
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const key = process.env.OPENAI_API_KEY
  if (!key) return NextResponse.json({ error: 'ChatGPT editing is not configured (missing OPENAI_API_KEY).' }, { status: 503 })

  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'Expected multipart form-data' }, { status: 400 }) }
  const file = form.get('file')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No file' }, { status: 400 })

  const oai = new FormData()
  oai.append('model', MODEL)
  oai.append('image', file, file.name || 'photo.png')
  oai.append('prompt', PROMPT)
  oai.append('size', '1024x1024')
  oai.append('n', '1')

  let r: Response
  try {
    r = await fetch('https://api.openai.com/v1/images/edits', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: oai,
    })
  } catch (e: any) {
    return NextResponse.json({ error: 'OpenAI request failed: ' + (e?.message || e) }, { status: 502 })
  }

  if (!r.ok) {
    const t = await r.text().catch(() => '')
    return NextResponse.json({ error: `OpenAI error ${r.status}: ${t.slice(0, 400)}` }, { status: 502 })
  }
  const j = await r.json()
  const b64 = j?.data?.[0]?.b64_json
  if (!b64) return NextResponse.json({ error: 'No image returned by OpenAI' }, { status: 502 })
  return NextResponse.json({ imageBase64: b64 })
}
