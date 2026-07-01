import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const maxDuration = 60

const MODEL = 'gpt-image-1'
const DEFAULT_PROMPT = 'Remove the background and place this exact object on a clean, evenly lit, pure white studio background. Keep the object itself unchanged, centered, photorealistic. Do not add any new objects, text, or props.'

// POST /api/admin/props/clean-image — JSON { imageUrl, prompt? }
// Fetches an EXISTING prop image (relative /images/... path or absolute URL),
// sends it to OpenAI's image edit API, and returns the cleaned image as PNG
// base64. This is a PREVIEW step only — it does not save or replace anything.
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const key = process.env.OPENAI_API_KEY
  if (!key) return NextResponse.json({ error: 'ChatGPT editing is not configured (missing OPENAI_API_KEY).' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const rawUrl = typeof body.imageUrl === 'string' ? body.imageUrl.trim() : ''
  if (!rawUrl) return NextResponse.json({ error: 'imageUrl is required' }, { status: 400 })
  const prompt = (typeof body.prompt === 'string' && body.prompt.trim()) ? body.prompt.trim() : DEFAULT_PROMPT

  // Resolve relative paths (e.g. "/images/props/x.jpg") against the site origin.
  let fetchUrl = rawUrl
  if (!/^https?:\/\//i.test(rawUrl)) {
    const base = (process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/$/, '')
    fetchUrl = base + (rawUrl.startsWith('/') ? rawUrl : '/' + rawUrl)
  }

  // Pull the current image bytes.
  let srcBuf: Buffer
  let srcType = 'image/jpeg'
  try {
    const imgRes = await fetch(fetchUrl, { cache: 'no-store' })
    if (!imgRes.ok) return NextResponse.json({ error: `Could not load the current image (${imgRes.status}).` }, { status: 502 })
    srcType = imgRes.headers.get('content-type') || srcType
    srcBuf = Buffer.from(await imgRes.arrayBuffer())
  } catch (e: any) {
    return NextResponse.json({ error: 'Failed to fetch the current image: ' + (e?.message || e) }, { status: 502 })
  }

  const ext = srcType.includes('png') ? 'png' : srcType.includes('webp') ? 'webp' : 'jpg'
  const file = new File([srcBuf], `source.${ext}`, { type: srcType })

  const oai = new FormData()
  oai.append('model', MODEL)
  oai.append('image', file)
  oai.append('prompt', prompt)
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
