// Marketing campaign helpers — audience segmentation, a signed (email-embedded)
// unsubscribe token, and a Resend batch sender with an unsubscribe link + physical
// address baked into every message. US opt-out model: audience = customers minus
// the suppression list.

import { createHmac, timingSafeEqual } from 'crypto'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabase'
import { finalizeEmail, getTemplate } from '@/lib/email-templates'
import { UNSUB_TOKEN } from '@/lib/email-designs'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')
// Keep marketing OFF the transactional sender to protect booking-email deliverability.
const MARKETING_FROM = process.env.MARKETING_FROM || process.env.EMAIL_FROM || 'Made Kulture <bookings@madekulture.com>'

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

// Page through a Supabase query 1,000 rows at a time. Throws on error so a failed
// read can never look like a smaller audience.
async function fetchAll(page: (from: number, to: number) => PromiseLike<{ data: any[] | null; error: any }>): Promise<any[]> {
  const out: any[] = []
  for (let from = 0; ; from += 1000) {
    const { data, error } = await page(from, from + 999)
    if (error) throw new Error(`Audience query failed: ${error.message}`)
    out.push(...(data ?? []))
    if (!data || data.length < 1000) return out
  }
}

// ── Audience segmentation ─────────────────────────────────────────────────────
export async function getSegmentRecipients(segment: SegmentKey): Promise<Recipient[]> {
  const db = supabaseAdmin()
  // Supabase returns at most 1,000 rows per request, so page through every table.
  // (Before this, "All customers" silently stopped at ~1,000 of 1,400+.)
  const [customers, bookings, suppressed] = await Promise.all([
    fetchAll((from, to) => db.from('customers').select('id, email, name').order('id').range(from, to)),
    fetchAll((from, to) => db.from('bookings').select('customer_id, auth_user_id, start_time').neq('status', 'cancelled').order('id').range(from, to)),
    fetchAll((from, to) => db.from('email_suppressions').select('email').order('email').range(from, to)),
  ])
  const supp = new Set((suppressed ?? []).map((s: any) => cleanEmail(s.email || '')))

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
    const email = cleanEmail((c as any).email || '')
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
// Build the unsubscribe URL, optionally tagged with the campaign that drove it
// (the campaign id isn't secret — the email is still signed inside the token).
function unsubUrl(email: string, campaignId?: string): string {
  const base = `${APP_URL}/api/unsubscribe?t=${makeUnsubToken(email)}`
  return campaignId ? `${base}&c=${campaignId}` : base
}

// A recipient address Resend will accept. ONE malformed address makes Resend
// reject the whole batch of 100 (2026-10-08, Issue 01: batch 2 failed on an
// "Invalid `to` field" and the send stopped at 100 of ~1,400), so anything that
// doesn't look like a plain address is skipped up front and reported.
// Clean an address as stored: some customer emails carry INVISIBLE characters
// (zero-width spaces, BOMs, non-breaking spaces, control chars — usually from
// copy-paste or the old Acuity import). They look normal on screen, fail Resend
// and failed 18 Issue 01 recipients on 2026-10-08. Also strips stray <>, quotes,
// mailto: and trailing punctuation. Lowercased so every comparison agrees.
export function cleanEmail(raw: string): string {
  return String(raw ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001F\u007F-\u009F\u00A0\u00AD\u034F\u061C\u115F\u1160\u17B4\u17B5\u180E\u2000-\u200F\u2028-\u202F\u205F-\u206F\u3000\uFEFF]/g, '')
    .replace(/^mailto:/i, '')
    .replace(/^[<"'\s]+|[>"'\s.,;:]+$/g, '')
    .replace(/\s+/g, '')
    .toLowerCase()
}

// Resend refuses reserved test domains (example.com etc.) and rejects the WHOLE
// batch over one — that is what failed ~200 Issue 01 recipients.
const TEST_DOMAIN = /@(?:[^@]*\.)?(?:example\.(?:com|net|org)|example|test|invalid|localhost)$/i

export function isSendableEmail(e: string): boolean {
  if (TEST_DOMAIN.test(e)) return false
  return /^[^\s@<>(),;:"\[\]\\]+@[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?)*\.[A-Za-z]{2,}$/.test(e)
}

// Send to a list. Chunks of 100 via Resend batch. Returns count actually queued.
// campaignId (when sending a real campaign) tags each email so the Resend webhook
// can attribute opens/clicks back to the campaign, AND records a 'sent' event per
// address the moment its batch is accepted — that record is what RESUME uses to
// never mail the same person twice.
export async function sendCampaignEmails(
  subject: string, bodyHtml: string, recipients: Recipient[], campaignId?: string, templateId?: string | null
): Promise<{ sent: number; error?: string; skipped: string[]; failedBatches: number }> {
  const skipped: string[] = []
  if (!process.env.RESEND_API_KEY) return { sent: 0, error: 'RESEND_API_KEY not set.', skipped, failedBatches: 0 }
  // A designed email MUST carry the unsubscribe token or nobody can opt out.
  if (getTemplate(templateId)?.fullDocument && !bodyHtml.includes(UNSUB_TOKEN)) {
    return { sent: 0, error: 'This design has no unsubscribe link — refusing to send.', skipped, failedBatches: 0 }
  }
  const clean: Recipient[] = []
  for (const r of recipients) {
    const e = cleanEmail(r.email)
    if (isSendableEmail(e)) clean.push({ ...r, email: e })
    else skipped.push(r.email)
  }
  if (skipped.length) console.warn('[marketing] skipping unsendable addresses:', skipped)

  const resend = new Resend(process.env.RESEND_API_KEY)
  const db = supabaseAdmin()
  let sent = 0
  let failedBatches = 0
  let lastError: string | undefined
  for (let i = 0; i < clean.length; i += 100) {
    // Stay under Resend's per-second API rate limit between batches.
    if (i > 0) await new Promise(r => setTimeout(r, 600))
    const chunk = clean.slice(i, i + 100)
    const batch = chunk.map(r => ({
      from: MARKETING_FROM,
      to: r.email,
      subject,
      html: finalizeEmail(templateId, bodyHtml, unsubUrl(r.email, campaignId)),
      headers: { 'List-Unsubscribe': `<${unsubUrl(r.email, campaignId)}>` },
      ...(campaignId ? { tags: [{ name: 'campaign_id', value: campaignId }] } : {}),
    }))
    try {
      const { error } = await resend.batch.send(batch as any)
      // Keep going: one bad batch no longer stops the rest of the list. The
      // addresses in it get no 'sent' record, so RESUME picks them up.
      if (error) { console.error('[marketing] batch error', error); lastError = (error as any).message; failedBatches++; continue }
      sent += chunk.length
      if (campaignId) {
        const { error: evErr } = await db.from('marketing_events')
          .insert(chunk.map(r => ({ campaign_id: campaignId, email: r.email.toLowerCase(), type: 'sent' })))
        if (evErr) console.error('[marketing] could not record sent events (RESUME may re-mail this batch):', evErr)
      }
    } catch (e: any) {
      console.error('[marketing] send failed', e)
      lastError = e?.message || 'Send failed.'
      failedBatches++
    }
  }
  return { sent, skipped, failedBatches, ...(lastError ? { error: lastError } : {}) }
}
