import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getSegmentRecipients, sendCampaignEmails, type SegmentKey } from '@/lib/marketing'
import { renderTemplateBody } from '@/lib/email-templates'

export const dynamic = 'force-dynamic'
// ~1,400 recipients = 15 Resend batches; give the send room to finish.
export const maxDuration = 300

// POST /api/admin/marketing/[id]/send  { test?: boolean, testEmail?: string }
// test=true → send a single preview to testEmail (no status change).
// otherwise → send to the whole segment (minus unsubscribes) and mark sent.
// { resume: true } on a SENT campaign → send to everyone in the segment who has
// no record of receiving it yet (2026-10-08: Issue 01 stopped at 100 of ~1,400
// when one bad address failed a batch). Never re-mails a recorded recipient.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let b: { test?: boolean; testEmail?: string; resume?: boolean } = {}
  try { b = await req.json() } catch { /* real send */ }

  const db = supabaseAdmin()
  const { data: c } = await db.from('marketing_campaigns')
    .select('id, subject, body_html, template_id, template_data, segment_key, status, promo_id, recipient_count').eq('id', params.id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'Campaign not found.' }, { status: 404 })

  // Resolve the attached promo code (rendered inside the template's promo block).
  let promoCode: string | undefined
  let promoInviteOnly = false
  if (c.promo_id) {
    const { data: p } = await db.from('promo_codes').select('code, recipients_only').eq('id', c.promo_id).maybeSingle()
    promoCode = p?.code || undefined
    promoInviteOnly = !!p?.recipients_only
  }

  // Invite-only promo (migration 128): put these addresses on the code's guest
  // list. Runs BEFORE any email leaves — a recipient must never receive a code
  // that refuses them at checkout. Returns an error message or null.
  const inviteRecipients = async (emails: string[]): Promise<string | null> => {
    if (!c.promo_id || !promoInviteOnly) return null
    const rows = Array.from(new Set(emails.map(e => e.toLowerCase().trim()).filter(Boolean)))
      .map(email => ({ promo_id: c.promo_id, email, campaign_id: c.id }))
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await db.from('promo_code_recipients')
        .upsert(rows.slice(i, i + 500), { onConflict: 'promo_id,email', ignoreDuplicates: true })
      if (error) return `Could not save the promo guest list: ${error.message}`
    }
    return null
  }

  // Template campaign → render branded HTML; legacy campaign → raw body_html (+ promo line).
  let body: string
  if (c.template_id) {
    body = renderTemplateBody(c.template_id as string, (c.template_data as any) || {}, promoCode)
  } else {
    body = (c.body_html as string) || ''
    if (promoCode) body += `<p style="margin:20px 0 0;font-size:16px;">Use code <strong style="color:#c9b27e;">${promoCode}</strong> at checkout.</p>`
  }

  // Test send — one email, no status change.
  if (b.test) {
    const to = (b.testEmail || '').trim()
    if (!to) return NextResponse.json({ error: 'Enter a test email.' }, { status: 400 })
    // The test address joins the guest list too, so the owner can try the code.
    const invErr = await inviteRecipients([to])
    if (invErr) return NextResponse.json({ error: invErr }, { status: 500 })
    const r = await sendCampaignEmails(`[TEST] ${c.subject}`, body, [{ email: to, name: 'Test' }], undefined, c.template_id as string | null)
    if (r.error) return NextResponse.json({ error: r.error }, { status: 502 })
    return NextResponse.json({ success: true, test: true, sent: r.sent })
  }

  // ── RESUME: finish a campaign that stopped part-way ──────────────────────
  if (b.resume) {
    if (c.status !== 'sent') return NextResponse.json({ error: 'Only a sent campaign can be resumed.' }, { status: 409 })
    // Everyone with ANY event on this campaign got it: 'sent' (recorded at send
    // time since 2026-10-08) or a Resend webhook event (delivered, opened,
    // bounced…) — the only record the earliest sends have.
    const already = new Set<string>()
    for (let from = 0; ; from += 1000) {
      const { data: ev, error: evErr } = await db.from('marketing_events').select('email')
        .eq('campaign_id', c.id).order('id').range(from, from + 999)
      if (evErr) return NextResponse.json({ error: `Could not check who already got it: ${evErr.message}` }, { status: 500 })
      for (const e of ev ?? []) already.add(String(e.email || '').trim().toLowerCase())
      if (!ev || ev.length < 1000) break
    }
    const reached = Number(c.recipient_count || 0)
    const all = await getSegmentRecipients(c.segment_key as SegmentKey)
    // Backstop for addresses whose delivery event hasn't arrived (a slow or
    // deferring mail server can hold it for hours — Issue 01 sat at 99 of 100).
    // The original send went out in the segment's own deterministic order
    // (customers by id, de-duped), so its first `reached` addresses are the ones
    // it mailed. Skipping them as well covers anyone not yet on record.
    // Applies only when the original send was in that order — i.e. campaigns
    // stopped before 'sent' events were recorded per address.
    if (already.size < reached) {
      for (const r of all.slice(0, reached)) already.add(String(r.email || '').trim().toLowerCase())
    }
    // ⚠️ Still short ⇒ the list changed shape since the first send; refuse
    // rather than risk re-mailing someone.
    if (already.size < reached) {
      return NextResponse.json({ error: `Only ${already.size} of the ${reached} people already sent are on record. Give it a few minutes and try again, so nobody gets it twice.` }, { status: 409 })
    }
    const rest = all.filter(r => !already.has(String(r.email || '').trim().toLowerCase()))
    if (rest.length === 0) return NextResponse.json({ error: 'Everyone in this segment already has it.' }, { status: 409 })

    // Claim sent → sending so two clicks can't both resume.
    const { data: claimedR, error: claimErrR } = await db.from('marketing_campaigns')
      .update({ status: 'sending' }).eq('id', params.id).eq('status', 'sent').select('id')
    if (claimErrR) return NextResponse.json({ error: claimErrR.message }, { status: 500 })
    if (!claimedR?.length) return NextResponse.json({ error: 'This campaign is already sending.' }, { status: 409 })

    const invErrR = await inviteRecipients(rest.map(r => r.email))
    if (invErrR) {
      await db.from('marketing_campaigns').update({ status: 'sent' }).eq('id', params.id)
      return NextResponse.json({ error: invErrR }, { status: 500 })
    }
    const rr = await sendCampaignEmails(c.subject, body, rest, c.id, c.template_id as string | null)
    const { error: stampErrR } = await db.from('marketing_campaigns')
      .update({ status: 'sent', recipient_count: reached + rr.sent }).eq('id', params.id)
    if (stampErrR) console.error('[marketing resume] SENT BUT NOT STAMPED —', params.id, stampErrR)
    return NextResponse.json({ success: true, resumed: true, sent: rr.sent, total: reached + rr.sent, skipped: rr.skipped, partialError: rr.error ?? null })
  }

  // Real send.
  if (c.status === 'sent') return NextResponse.json({ error: 'This campaign was already sent.' }, { status: 409 })
  const recipients = await getSegmentRecipients(c.segment_key as SegmentKey)
  if (recipients.length === 0) return NextResponse.json({ error: 'No recipients in that segment.' }, { status: 400 })

  // CLAIM THE CAMPAIGN BEFORE SENDING, not after.
  //
  // The guard above is a read-check-write: two clicks a second apart both read
  // 'draft' and both mail the entire segment. And the status write used to
  // happen only AFTER the send with its error unread — so if it failed, the
  // campaign stayed 'draft', the UI still offered SEND, and one more click
  // re-mailed everyone. Flipping draft -> sending here, conditionally and with
  // .select(), means exactly one caller can ever get past this line.
  const { data: claimed, error: claimErr } = await db
    .from('marketing_campaigns')
    .update({ status: 'sending' })
    .eq('id', params.id)
    .eq('status', 'draft')
    .select('id')
  if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 })
  if (!claimed || claimed.length === 0) {
    return NextResponse.json({ error: 'This campaign is already sending or was already sent.' }, { status: 409 })
  }

  const invErr = await inviteRecipients(recipients.map(r => r.email))
  if (invErr) {
    await db.from('marketing_campaigns').update({ status: 'draft' }).eq('id', params.id)
    return NextResponse.json({ error: invErr }, { status: 500 })
  }

  const r = await sendCampaignEmails(c.subject, body, recipients, c.id, c.template_id as string | null)

  // Nothing went out — release the claim so it can be retried.
  if (r.error && r.sent === 0) {
    await db.from('marketing_campaigns').update({ status: 'draft' }).eq('id', params.id)
    return NextResponse.json({ error: r.error }, { status: 502 })
  }

  const { error: stampErr } = await db.from('marketing_campaigns')
    .update({ status: 'sent', recipient_count: r.sent, sent_at: new Date().toISOString() })
    .eq('id', params.id)
  // Mail is already out. The campaign stays 'sending', which still fails the
  // claim above, so the worst case is a stuck row — never a second mailing.
  if (stampErr) console.error('[marketing send] SENT BUT NOT STAMPED —', params.id, stampErr)

  return NextResponse.json({ success: true, sent: r.sent, skipped: r.skipped, partialError: r.error ?? null })
}
