import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { PROP_CATEGORIES } from '@/lib/props'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const MODEL = 'claude-haiku-4-5-20251001'

// POST /api/admin/props/analyze — body { imageBase64, mediaType }.
// Returns { name, category, description } suggested by Claude vision.
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return NextResponse.json({ error: 'AI is not configured (missing ANTHROPIC_API_KEY).' }, { status: 503 })

  const { imageBase64, mediaType } = await req.json().catch(() => ({} as any))
  if (!imageBase64) return NextResponse.json({ error: 'No image' }, { status: 400 })

  const prompt = `You are cataloging a single prop for a photography studio's rental directory.
Look at the prop in the image and reply with ONLY a JSON object (no markdown, no prose):
{"name": "...", "category": "...", "description": "..."}
- name: a short Title Case label, 2-4 words (e.g. "Vintage Rocking Chair").
- category: EXACTLY one of: ${PROP_CATEGORIES.join(', ')}.
- description: one short sentence (max ~18 words) describing the prop for renters.`

  let resp: Response
  try {
    resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/jpeg', data: imageBase64 } },
            { type: 'text', text: prompt },
          ],
        }],
      }),
    })
  } catch (e: any) {
    return NextResponse.json({ error: 'AI request failed: ' + (e?.message || e) }, { status: 502 })
  }

  if (!resp.ok) {
    const t = await resp.text().catch(() => '')
    return NextResponse.json({ error: `AI error ${resp.status}: ${t.slice(0, 300)}` }, { status: 502 })
  }

  const data = await resp.json()
  const text: string = (data?.content?.[0]?.text || '').trim()
  let parsed: any = {}
  try {
    const m = text.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(m ? m[0] : text)
  } catch {
    return NextResponse.json({ error: 'Could not parse AI response', raw: text }, { status: 502 })
  }
  // Normalize category to an allowed value.
  const cat = (PROP_CATEGORIES as readonly string[]).find(c => c.toLowerCase() === String(parsed.category || '').toLowerCase()) || 'Misc'
  return NextResponse.json({
    name: String(parsed.name || '').slice(0, 80),
    category: cat,
    description: String(parsed.description || '').slice(0, 300),
  })
}
