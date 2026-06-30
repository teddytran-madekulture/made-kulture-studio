import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { PROP_CATEGORIES } from '@/lib/props'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const MODEL = 'gpt-4o-mini'

// POST /api/admin/props/analyze — body { imageBase64, mediaType }.
// Uses OpenAI vision to suggest { name, category, description }.
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const key = process.env.OPENAI_API_KEY
  if (!key) return NextResponse.json({ error: 'AI is not configured (missing OPENAI_API_KEY).' }, { status: 503 })

  const { imageBase64, mediaType } = await req.json().catch(() => ({} as any))
  if (!imageBase64) return NextResponse.json({ error: 'No image' }, { status: 400 })

  const prompt = `You are cataloging a single prop for a photography studio's rental directory.
Look at the prop in the image and return a JSON object with these keys:
- "name": a short Title Case label, 2-4 words (e.g. "Vintage Rocking Chair").
- "category": EXACTLY one of: ${PROP_CATEGORIES.join(', ')}.
- "description": one short sentence (max ~18 words) describing the prop for renters.`

  let resp: Response
  try {
    resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 400,
        response_format: { type: 'json_object' },
        messages: [{
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: `data:${mediaType || 'image/jpeg'};base64,${imageBase64}` } },
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
  const text: string = (data?.choices?.[0]?.message?.content || '').trim()
  let parsed: any = {}
  try {
    const m = text.match(/\{[\s\S]*\}/)
    parsed = JSON.parse(m ? m[0] : text)
  } catch {
    return NextResponse.json({ error: 'Could not parse AI response', raw: text }, { status: 502 })
  }
  const cat = (PROP_CATEGORIES as readonly string[]).find(c => c.toLowerCase() === String(parsed.category || '').toLowerCase()) || 'Misc'
  return NextResponse.json({
    name: String(parsed.name || '').slice(0, 80),
    category: cat,
    description: String(parsed.description || '').slice(0, 300),
  })
}
