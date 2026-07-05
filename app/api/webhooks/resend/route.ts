import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// Resend delivery/engagement webhook. Records opens/clicks/bounces/complaints per
// campaign (attributed via the campaign_id tag we stamp on each send) and auto-adds
// hard bounces + complaints to the suppression list. Signed with Svix — verified
// against RESEND_WEBHOOK_SECRET when that env is set.

// Map Resend event names → our marketing_events.type values.
const TYPE_MAP: Record<string, string> = {
  'email.delivered': 'delivered',
  'email.opened': 'opened',
  'email.clicked': 'clicked',
  'email.bounced': 'bounced',
  'email.complained': 'complained',
}

// Verify a Svix-signed webhook. Returns true if valid (or if no secret configured).
function verify(secret: string | undefined, headers: Headers, raw: string): boolean {
  if (!secret) return true // not hardened yet — accept and rely on the obscure URL until the secret is set
  const id = headers.get('svix-id'), ts = headers.get('svix-timestamp'), sigHeader = headers.get('svix-signature')
  if (!id || !ts || !sigHeader) return false
  try {
    const keyB64 = secret.startsWith('whsec_') ? secret.slice(6) : secret
    const key = Buffer.from(keyB64, 'base64')
    const expected = createHmac('sha256', key).update(`${id}.${ts}.${raw}`).digest('base64')
    const eBuf = Buffer.from(expected)
    // Header is a space-separated list of "v1,<sig>" — accept if any matches.
    return sigHeader.split(' ').some(part => {
      const sig = part.includes(',') ? part.split(',')[1] : part
      const sBuf = Buffer.from(sig)
      return sBuf.length === eBuf.length && timingSafeEqual(sBuf, eBuf)
    })
  } catch { return false }
}

// Pull our campaign_id tag out of whichever shape Resend sends (array or object).
function campaignIdOf(data: any): string | null {
  const t = data?.tags
  if (Array.isArray(t)) { const hit = t.find((x: any) => x?.name === 'campaign_id'); return hit?.value ?? null }
  if (t && typeof t === 'object') return t.campaign_id ?? null
  return null
}

export async function POST(req: NextRequest) {
  const raw = await req.text()
  if (!verify(process.env.RESEND_WEBHOOK_SECRET, req.headers, raw)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let evt: any
  try { evt = JSON.parse(raw) } catch { return NextResponse.json({ error: 'Bad payload' }, { status: 400 }) }

  const type = TYPE_MAP[evt?.type]
  if (!type) return NextResponse.json({ ok: true, ignored: evt?.type ?? null })

  const data = evt.data ?? {}
  const to = Array.isArray(data.to) ? data.to[0] : data.to
  const email = (to || '').toLowerCase().trim()
  if (!email) return NextResponse.json({ ok: true, skipped: 'no recipient' })
  const campaignId = campaignIdOf(data)

  const db = supabaseAdmin()
  try {
    await db.from('marketing_events').insert({ campaign_id: campaignId, email, type })
    // Stop emailing addresses that hard-bounce or complain.
    if (type === 'bounced' || type === 'complained') {
      await db.from('email_suppressions').upsert(
        { email, reason: type === 'bounced' ? 'bounce' : 'complaint', campaign_id: campaignId },
        { onConflict: 'email' }
      )
    }
  } catch (e) {
    console.error('[resend-webhook] insert failed', e)
    return NextResponse.json({ error: 'store failed' }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
