// Marketing campaign helpers — audience segmentation, a signed (email-embedded)
// unsubscribe token, and a Resend batch sender with an unsubscribe link + physical
// address baked into every message. US opt-out model: audience = customers minus
// the suppression list.

import { createHmac, timingSafeEqual } from 'crypto'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabase'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')
// Keep marketing OFF the transactional sender to protect booking-email deliverability.
const MARKETING_FROM = process.env.MARKETING_FROM || process.env.EMAIL_FROM || 'Made Kulture <bookings@madekulture.com>'
const STUDIO_ADDRESS_LINE = '4825 Gulf Freeway, Houston TX 77023'

export type SegmentKey = 'all' | 'members' | 'guests' | 'lapsed' | 'recent'
export interface Recipient { email: string; name: string | null }

// ── Signed unsubscribe token (email embedded, no plaintext email in the URL) ──
function b64url(s: string) { return Buffer.from(s).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '') }
function unb64url(s: string) { return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString() }
function key() { return process.env.SESSION_SECRET ?? process.env.ADMIN_PASSWORD ?? 'dev-fallback' }

export function makeUnsubToken(email: string): string {
  const body = b64url(email.toLowerCase().trim())
  const sig = createHmac('sha256', key()).update(body).digest('hex')
  return `${body}.${sig}`
}
export function readUnsubToken(token: string): string | null {
  const dot = token.indexOf('.')
  if (dot === -1) return null
  const body = token.slice(0, dot), sig = token.slice(dot + 1)
  try {
    const expected = createHmac('sha256', key()).update(body).digest('hex')
    const a = Buffer.from(sig, 'hex'), b = Buffer.from(expected, 'hex')
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    return unb64url(body)
  } catch { return null }
}

// ── Audience segmentation ─────────────────────────────────────────────────────
export async function getSegmentRecipients(segment: SegmentKey): Promise<Recipient[]> {
  const db = supabaseAdmin()
  const [{ data: customers }, { data: bookings }, { data: suppressed }] = await Promise.all([
    db.from('customers').select('id, email, name'),
    db.from('bookings').select('customer_id, auth_user_id, start_time').neq('status', 'cancelled'),
    db.from('email_suppressions').select('email'),
  ])
  const supp = new Set((suppressed ?? []).map((s: any) => (s.email || '').toLowerCase()))

  // Per-customer: latest booking + whether ever booked with an account.
  const latest: Record<string, number> = {}
  const isMember: Record<string, boolean> = {}
  for (const b of bookings ?? []) {
    const cid = (b as any).customer_id
    if (!cid) continue
    const t = Date.parse((b as any).start_time)
    if (!latest[cid] || t > latest[cid]) latest[cid] = t
    if ((b as any).auth_user_id) isMember[cid] = true
  }
  const now = Date.now()
  const D90 = 90 * 24 * 3600 * 1000
  const D30 = 30 * 24 * 3600 * 1000

  const out: Recipient[] = []
  for (const c of customers ?? []) {
    const email = ((c as any).email || '').toLowerCase().trim()
    if (!email || supp.has(email)) continue
    const cid = (c as any).id
    const last = latest[cid]
    const member = !!isMember[cid]
    let keep = false
    switch (segment) {
      case 'all':     keep = true; break
      case 'members': keep = member; break
      case 'guests':  keep = !member; break
      case 'recent':  keep = last != null && now - last <= D30; break
      case 'lapsed':  keep = last == null || now - last > D90; break
    }
    if (keep) out.push({ email, name: (c as any).name ?? null })
  }
  // De-dupe by email.
  const seen = new Set<string>()
  return out.filter(r => (seen.has(r.email) ? false : (seen.add(r.email), true)))
}

// Counts for every segment in one pass (for the admin UI).
export async function getSegmentCounts(): Promise<Record<SegmentKey, number>> {
  const segs: SegmentKey[] = ['all', 'members', 'guests', 'recent', 'lapsed']
  const counts = {} as Record<SegmentKey, number>
  for (const s of segs) counts[s] = (await getSegmentRecipients(s)).length
  return counts
}

// ── Send ──────────────────────────────────────────────────────────────────────
function wrapHtml(bodyHtml: string, unsubUrl: string): string {
  return `<!DOCTYPE html><html><body style="margin:0;background:#111;font-family:Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#111;padding:32px 16px;"><tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#1a1a1a;border-radius:8px;overflow:hidden;">
      <tr><td style="background:#000;padding:18px 28px;border-bottom:2px solid #c9b27e;"><span style="font-family:'Courier New',monospace;font-size:18px;font-weight:700;letter-spacing:0.15em;color:#fff;">MADE KULTURE</span></td></tr>
      <tr><td style="padding:28px;color:#ddd;font-size:15px;line-height:1.7;">${bodyHtml}</td></tr>
      <tr><td style="padding:18px 28px;border-top:1px solid #333;color:#666;font-size:11px;line-height:1.6;">
        Made Kulture · ${STUDIO_ADDRESS_LINE}<br/>
        You're receiving this because you've booked with us. <a href="${unsubUrl}" style="color:#999;">Unsubscribe</a>.
      </td></tr>
    </table>
  </td></tr></table></body></html>`
}

// Build the unsubscribe URL, optionally tagged with the campaign that drove it
// (the campaign id isn't secret — the email is still signed inside the token).
function unsubUrl(email: string, campaignId?: string): string {
  const base = `${APP_URL}/api/unsubscribe?t=${makeUnsubToken(email)}`
  return campaignId ? `${base}&c=${campaignId}` : base
}

// Send to a list. Chunks of 100 via Resend batch. Returns count actually queued.
// campaignId (when sending a real campaign) tags each email so the Resend webhook
// can attribute opens/clicks back to the campaign.
export async function sendCampaignEmails(
  subject: string, bodyHtml: string, recipients: Recipient[], campaignId?: string
): Promise<{ sent: number; error?: string }> {
  if (!process.env.RESEND_API_KEY) return { sent: 0, error: 'RESEND_API_KEY not set.' }
  const resend = new Resend(process.env.RESEND_API_KEY)
  let sent = 0
  for (let i = 0; i < recipients.length; i += 100) {
    const chunk = recipients.slice(i, i + 100)
    const batch = chunk.map(r => ({
      from: MARKETING_FROM,
      to: r.email,
      subject,
      html: wrapHtml(bodyHtml, unsubUrl(r.email, campaignId)),
      headers: { 'List-Unsubscribe': `<${unsubUrl(r.email, campaignId)}>` },
      ...(campaignId ? { tags: [{ name: 'campaign_id', value: campaignId }] } : {}),
    }))
    try {
      const { error } = await resend.batch.send(batch as any)
      if (error) { console.error('[marketing] batch error', error); return { sent, error: (error as any).message } }
      sent += chunk.length
    } catch (e: any) {
      console.error('[marketing] send failed', e)
      return { sent, error: e?.message || 'Send failed.' }
    }
  }
  return { sent }
}
