// Admin — spelling/grammar polish for anything you're about to send.
//
// Fixes mechanics only (spelling, grammar, punctuation, obvious typos). It is
// explicitly told NOT to rewrite voice, restructure, or add/remove facts — so
// what comes back is the same message, correctly spelled. Used by the June
// inbox draft editor + the reply box; safe to reuse anywhere in admin.
//
// Same zero-SDK raw-fetch pattern as lib/agent/june.ts. Env-gated on
// ANTHROPIC_API_KEY (already set for June).

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'
const MODEL = process.env.JUNE_MODEL || 'claude-haiku-4-5-20251001'
const MAX_CHARS = 8000

const SYSTEM = `You are a copy editor. You fix ONLY mechanics: spelling, grammar, punctuation, capitalization, obvious typos, and doubled/missing words.

Hard rules:
- Do NOT change the writer's voice, tone, word choice, or sentence structure beyond what a mechanical fix requires.
- Do NOT add, remove, or reword any fact, number, price, time, name, or policy.
- Do NOT add greetings, sign-offs, pleasantries, or emoji that were not already there.
- Do NOT reformat. Keep line breaks and paragraph breaks exactly as given.
- Leave URLs, email addresses, [bracketed tokens], and markdown untouched.
- If the text is already clean, return it byte-for-byte unchanged.

Return ONLY the corrected text. No preamble, no explanation, no quotes around it.`

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Polish is not configured (ANTHROPIC_API_KEY missing)' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  const text: string = typeof body?.text === 'string' ? body.text : ''
  if (!text.trim()) return NextResponse.json({ error: 'text required' }, { status: 400 })
  if (text.length > MAX_CHARS) return NextResponse.json({ error: `Too long to polish (${text.length} chars, max ${MAX_CHARS})` }, { status: 400 })

  try {
    const r = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': API_VERSION,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        temperature: 0,
        system: SYSTEM,
        messages: [{ role: 'user', content: text }],
      }),
    })

    if (!r.ok) {
      const detail = await r.text().catch(() => '')
      console.error('[polish] Claude API error', r.status, detail.slice(0, 400))
      return NextResponse.json({ error: 'Could not reach the proofreader. Try again.' }, { status: 502 })
    }

    const d = await r.json()
    const out = (d?.content ?? [])
      .filter((b: any) => b?.type === 'text')
      .map((b: any) => b.text)
      .join('')
      .trim()

    if (!out) return NextResponse.json({ error: 'Proofreader returned nothing. Try again.' }, { status: 502 })

    return NextResponse.json({ text: out, changed: out !== text.trim() })
  } catch (e: any) {
    console.error('[polish] failed', e?.message)
    return NextResponse.json({ error: 'Could not reach the proofreader. Try again.' }, { status: 502 })
  }
}
