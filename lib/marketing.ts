// Marketing campaign helpers — audience segmentation, a signed (email-embedded)
// unsubscribe token, and a Resend batch sender with an unsubscribe link + physical
// address baked into every message. US opt-out model: audience = customers minus
// the suppression list.

import { createHmac, timingSafeEqual } from 'crypto'
import { Resend } from 'resend'
import { supabaseAdmin } from '@/lib/supabase'
import { finalizeEmail, getTemplate } from '@/lib/email-templates'
import { UNSUB_TOKEN } from '@/lib/email-designs'
import { listAllAuthUsers } from '@/lib/auth-user'
import { ROLE_CATEGORIES, SERVICES_CATEGORY } from '@/lib/roles'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')
// Keep marketing OFF the transactional sender to protect booking-email deliverability.
const MARKETING_FROM = process.env.MARKETING_FROM || process.env.EMAIL_FROM || 'Made Kulture <bookings@madekulture.com>'

export type SegmentKey = 'all' | 'members' | 'guests' | 'lapsed' | 'recent'
  | 'photo_video' | 'creatives' | 'brands_vendors'
// The ONE list of valid audiences — the POST route validates against this, so a
// new segment only has to be added here (and labelled in app/admin/marketing).
export const SEGMENT_KEYS: SegmentKey[] = ['all', 'members', 'guests', 'recent', 'lapsed', 'photo_video', 'creatives', 'brands_vendors']

// ── Profile-based audiences (2026-11-23) ─────────────────────────────────────
// Built from website ACCOUNTS (customer_profiles + auth.users), not bookings, so
// they can tell a photographer from someone who booked their graduation photos.
//   photo_video    — picked a Photo & Video role, or Content Creator / Social
//                    Media Manager (the people a content gig is for)
//   creatives      — account type Creative, or picked any creative role
//   brands_vendors — account type Brand or Vendor
// ⚠️ Accounts made before migration 039 defaulted to 'creative' without choosing,
// so 'creatives' includes some early booking-only accounts. photo_video does
// not have that problem: it needs a role the person actually picked.
const PROFILE_SEGMENTS = new Set<SegmentKey>(['photo_video', 'creatives', 'brands_vendors'])
const PHOTO_VIDEO_ROLES = new Set<string>([
  ...(ROLE_CATEGORIES.find(c => c.label === 'Photo & Video')?.roles ?? []),
  'Content Creator', 'Social Media Manager',
])
const NON_SERVICE_ROLES = new Set<string>(
  ROLE_CATEGORIES.filter(c => c.label !== SERVICES_CATEGORY).flatMap(c => c.roles),
)

async function getProfileSegmentRecipients(segment: SegmentKey, supp: Set<string>): Promise<Recipient[]> {
  const db = supabaseAdmin()
  const [profiles, users] = await Promise.all([
    fetchAll((from, to) => db.from('customer_profiles')
      .select('id, full_name, roles, account_type, underage_blocked_at').order('id').range(from, to)),
    listAllAuthUsers(db),
  ])
  const userById = new Map<string, any>(users.map((u: any) => [u.id, u]))
  const out: Recipient[] = []
  for (const p of profiles) {
    if ((p as any).underage_blocked_at) continue
    const u = userById.get((p as any).id)
    // Unconfirmed sign-ups are skipped: bots signed up with stolen emails
    // (2026-10-05), and a confirmed address is the only proof it's theirs.
    if (!u || !u.email || !u.email_confirmed_at) continue
    const roles: string[] = Array.isArray((p as any).roles) ? (p as any).roles : []
    const type = String((p as any).account_type || '')
    let keep = false
    switch (segment) {
      case 'photo_video':    keep = roles.some(r => PHOTO_VIDEO_ROLES.has(r)); break
      case 'creatives':      keep = type === 'creative' || roles.some(r => NON_SERVICE_ROLES.has(r)); break
      case 'brands_vendors': keep = type === 'brand' || type === 'vendor'; break
    }
    if (!keep) continue
    const email = cleanEmail(u.email)
    if (email && !supp.has(email)) out.push({ email, name: (p as any).full_name ?? null })
  }
  const seen = new Set<string>()
  return out.filter(r => (seen.has(r.email) ? false : (seen.add(r.email), true)))
}
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
  if (PROFILE_SEGMENTS.has(segment)) {
    const suppressed = await fetchAll((from, to) => db.from('email_suppressions').select('email').order('email').range(from, to))
    return getProfileSegmentRecipients(segment, new Set(suppressed.map((s: any) => cleanEmail(s.email || ''))))
  }
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
    // Some records hold SEVERAL addresses in one field ("a@x.com,b@y.com" —
    // typed that way at booking, mostly old Acuity rows). Each one is a person
    // who should get the email, so split and send to every address in it.
    // (2026-10-08: ~19 such records were skipped from Issue 01.)
    const emails = String((c as any).email || '').split(/[,;\/]|\s+(?=\S+@)/).map(cleanEmail).filter(Boolean)
    if (!emails.length) continue
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
    if (keep) for (const email of emails) if (!supp.has(email)) out.push({ email, name: (c as any).name ?? null })
  }
  // De-dupe by email.
  const seen = new Set<string>()
  return out.filter(r => (seen.has(r.email) ? false : (seen.add(r.email), true)))
}

// Who in a SENT campaign's segment has no record of receiving it (2026-10-08).
// Used by FINISH SENDING and by the campaign list, so the button appears
// whenever anyone is genuinely left — comparing segment SIZE to the sent count
// broke as soon as bounces left the segment (1,368 people, 1,396 sent, ~37
// still unsent).
// Record = any event on the campaign: 'sent' (written per address at send time
// since 2026-10-08) or a Resend webhook event (delivered, opened, bounced…).
export async function campaignLeftovers(
  campaignId: string, segment: SegmentKey, reached: number,
): Promise<{ rest: Recipient[] } | { error: string }> {
  const db = supabaseAdmin()
  const already = new Set<string>()
  const recordedSent = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data: ev, error } = await db.from('marketing_events').select('email, type')
      .eq('campaign_id', campaignId).order('id').range(from, from + 999)
    if (error) return { error: `Could not check who already got it: ${error.message}` }
    for (const e of ev ?? []) { const em = cleanEmail((e as any).email); already.add(em); if ((e as any).type === 'sent') recordedSent.add(em) }
    if (!ev || ev.length < 1000) break
  }
  const all = await getSegmentRecipients(segment)
  // Backstop for a first batch sent before per-address 'sent' rows existed and
  // whose delivery events haven't all arrived: that send went out in the
  // segment's own order, so its first (reached − recorded) addresses are covered.
  const unrecorded = Math.max(0, reached - recordedSent.size)
  if (already.size < reached && unrecorded > 0) {
    for (const r of all.slice(0, unrecorded)) already.add(cleanEmail(r.email))
  }
  if (already.size < reached) {
    return { error: `Only ${already.size} of the ${reached} people already sent are on record. Give it a few minutes and try again, so nobody gets it twice.` }
  }
  return { rest: all.filter(r => !already.has(cleanEmail(r.email))) }
}

// Counts for every segment in one pass (for the admin UI).
export async function getSegmentCounts(): Promise<Record<SegmentKey, number>> {
  const segs: SegmentKey[] = SEGMENT_KEYS
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
