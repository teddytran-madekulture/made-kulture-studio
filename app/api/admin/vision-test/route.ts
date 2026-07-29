// Admin — vision diagnostic. Answers "can the model actually see this image?"
// without waiting on an email round trip.
//
// POST /api/admin/vision-test { attachmentId }
//
// Takes an existing email_attachments row, runs the SAME decision path the email
// poller uses (fetch from Gmail → size check → inline base64 vs signed URL), then
// makes one minimal Claude call with just that image and "describe this".
// Returns every step plus the raw API error body if it fails, so a failure points
// at a cause instead of needing to be guessed at.
//
// Built after three rounds of fixing vision by inference: the email loop is a
// 5-minute feedback cycle, which is far too slow to debug against.

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { fetchAttachment } from '@/lib/agent/gmail'
import { VISION_MIME_TYPES, VISION_MAX_BYTES, VISION_BASE64_MAX_BYTES } from '@/lib/agent/june'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const API_URL = 'https://api.anthropic.com/v1/messages'
const API_VERSION = '2023-06-01'
const MODEL = process.env.JUNE_MODEL || 'claude-haiku-4-5-20251001'
const BUCKET = 'email-media'

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const apiKey = process.env.ANTHROPIC_API_KEY
  const steps: any = { model: MODEL, apiKeyPresent: !!apiKey }
  if (!apiKey) return NextResponse.json({ ok: false, steps, error: 'ANTHROPIC_API_KEY missing' }, { status: 503 })

  const body = await req.json().catch(() => ({}))
  let attachmentId: string | undefined = body?.attachmentId

  // Convenience: with no id, grab the newest inbound image we know about.
  if (!attachmentId) {
    const { data } = await supabase
      .from('email_attachments')
      .select('id, mime_type')
      .eq('direction', 'in')
      .order('created_at', { ascending: false })
      .limit(20)
    attachmentId = (data ?? []).find(a => VISION_MIME_TYPES.includes(a.mime_type))?.id
    steps.autoPicked = attachmentId ?? null
  }
  if (!attachmentId) return NextResponse.json({ ok: false, steps, error: 'no inbound image attachment found' }, { status: 404 })

  const { data: att } = await supabase
    .from('email_attachments')
    .select('id, filename, mime_type, size_bytes, gmail_msg_id, gmail_attachment_id, direction')
    .eq('id', attachmentId).maybeSingle()
  if (!att) return NextResponse.json({ ok: false, steps, error: 'attachment row not found' }, { status: 404 })

  steps.row = {
    filename: att.filename, mimeType: att.mime_type,
    sizeBytesFromGmailMeta: att.size_bytes,
    mimeSupported: VISION_MIME_TYPES.includes(att.mime_type),
  }
  steps.limits = { VISION_MAX_BYTES, VISION_BASE64_MAX_BYTES }

  if (!att.gmail_msg_id || !att.gmail_attachment_id) {
    return NextResponse.json({ ok: false, steps, error: 'not an inbound Gmail-pointer attachment' }, { status: 400 })
  }

  // ── 1. bytes from Gmail
  let bytes: Buffer | null = null
  try {
    bytes = await fetchAttachment(att.gmail_msg_id, att.gmail_attachment_id)
  } catch (e: any) {
    steps.gmailFetchError = String(e?.message || e)
  }
  if (!bytes) return NextResponse.json({ ok: false, steps, error: 'could not fetch bytes from Gmail' }, { status: 502 })
  steps.actualBytes = bytes.length
  steps.actualMB = +(bytes.length / 1048576).toFixed(2)
  steps.base64Bytes = Math.ceil(bytes.length * 4 / 3)

  if (bytes.length > VISION_MAX_BYTES) {
    return NextResponse.json({ ok: false, steps, error: 'over VISION_MAX_BYTES — too big to show either way' })
  }

  // ── 2. same branch the poller takes
  const useUrl = bytes.length > VISION_BASE64_MAX_BYTES
  steps.path = useUrl ? 'signed-url' : 'inline-base64'

  let source: any
  let tempPath: string | null = null
  try {
    if (useUrl) {
      tempPath = `vision-test/${randomUUID()}`
      const up = await supabase.storage.from(BUCKET)
        .upload(tempPath, bytes, { contentType: att.mime_type, upsert: true })
      if (up.error) {
        steps.uploadError = up.error.message
        return NextResponse.json({ ok: false, steps, error: 'upload failed' }, { status: 500 })
      }
      const signed = await supabase.storage.from(BUCKET).createSignedUrl(tempPath, 600)
      if (signed.error || !signed.data?.signedUrl) {
        steps.signError = signed.error?.message ?? 'no url'
        return NextResponse.json({ ok: false, steps, error: 'signing failed' }, { status: 500 })
      }
      steps.signedUrlHost = new URL(signed.data.signedUrl).host
      // Prove the URL is publicly fetchable — if Anthropic can't reach it, this
      // is where it shows up rather than as a vague API error.
      try {
        const probe = await fetch(signed.data.signedUrl, { method: 'GET' })
        steps.urlProbe = { status: probe.status, contentType: probe.headers.get('content-type') }
      } catch (e: any) {
        steps.urlProbe = { error: String(e?.message || e) }
      }
      source = { type: 'url', url: signed.data.signedUrl }
    } else {
      source = { type: 'base64', media_type: att.mime_type, data: bytes.toString('base64') }
    }

    // ── 3. one minimal call — image only, no tools, no June prompt
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': API_VERSION, 'content-type': 'application/json' },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source },
            { type: 'text', text: 'In one sentence: what object is in this image?' },
          ],
        }],
      }),
    })
    steps.anthropicStatus = res.status
    const raw = await res.text()
    if (!res.ok) {
      steps.anthropicErrorBody = raw.slice(0, 1200)
      return NextResponse.json({ ok: false, steps, error: `Anthropic ${res.status}` })
    }
    const data = JSON.parse(raw)
    steps.modelSaw = (data.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    steps.usage = data.usage
    return NextResponse.json({ ok: true, steps })
  } finally {
    if (tempPath) {
      try { await supabase.storage.from(BUCKET).remove([tempPath]) } catch { /* ignore */ }
    }
  }
}
