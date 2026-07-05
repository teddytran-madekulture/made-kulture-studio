import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSMS, toE164 } from '@/lib/sms'
import { sendReviewRequestEmail, sendReviewFollowupEmail } from '@/lib/email'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { fetch: (input: any, init?: any) => fetch(input, { ...init, cache: 'no-store' }) } }
)

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')

// GET /api/cron/review-requests — runs every 30 min via Supabase pg_cron
// (see migration 066).
//
// Pass 1 (the ask): bookings that ended 2-24 hours ago get a text + email with
// a click-tracked link to our Google review page. At most one ask per customer
// per 90 days, so regulars aren't nagged every session.
// Pass 2 (the follow-up): bookings asked 3-7 days ago whose link was never
// clicked get one gentle email reminder. That's the last touch.
//
// Off by default: does nothing until the review URL is set and the switch is
// turned on in Admin -> Settings -> Emails.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // Settings gate
  const { data: settingsRows } = await supabase.from('site_settings').select('key, value')
    .in('key', ['review_url', 'review_requests_enabled'])
  const settings: Record<string, string> = {}
  for (const r of settingsRows || []) if (r.key) settings[r.key] = r.value
  if (settings.review_requests_enabled !== '1' || !settings.review_url) {
    return NextResponse.json({ ok: true, skipped: 'disabled or no review URL' })
  }

  const now = Date.now()
  const iso = (ms: number) => new Date(ms).toISOString()
  const H = 3600_000
  const D = 24 * H

  let asked = 0, followedUp = 0, deduped = 0

  // ── Pass 1: initial ask (ended 2-24h ago) ──────────────────────────────────
  const { data: due, error } = await supabase
    .from('bookings')
    .select('id, end_time, customer_id, customers ( name, phone, email )')
    .in('status', ['confirmed', 'completed'])
    .is('review_request_sent_at', null)
    .gte('end_time', iso(now - D))
    .lte('end_time', iso(now - 2 * H))
  if (error) {
    console.error('[review-requests] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  for (const b of due ?? []) {
    const customer = Array.isArray(b.customers) ? b.customers[0] : b.customers
    if (!customer) continue

    // Claim the row first so an overlapping run can't double-send. Deduped
    // customers get stamped too — it just means "handled", and stops rechecks.
    const { data: claimed } = await supabase.from('bookings')
      .update({ review_request_sent_at: new Date().toISOString() })
      .eq('id', b.id)
      .is('review_request_sent_at', null)
      .select('id')
    if (!claimed?.length) continue

    // 90-day cap per customer: if any other booking of theirs was asked in the
    // last 90 days, skip this one quietly.
    if (b.customer_id) {
      const { data: recent } = await supabase.from('bookings')
        .select('id')
        .eq('customer_id', b.customer_id)
        .neq('id', b.id)
        .gte('review_request_sent_at', iso(now - 90 * D))
        .limit(1)
      if (recent?.length) {
        // Fully close it out so the follow-up pass skips it too.
        await supabase.from('bookings').update({ review_followup_sent_at: new Date().toISOString() }).eq('id', b.id)
        deduped++
        continue
      }
    }

    const first = (customer.name || '').split(' ')[0] || 'there'
    const link = `${APP_URL}/review/${b.id}`

    const phone = toE164(customer.phone)
    if (phone) {
      await sendSMS(phone, `Hey ${first}! Thanks for shooting at Made Kulture. If you had a good session, a quick Google review helps our small studio a ton: ${link}`)
    }
    if (customer.email) {
      try { await sendReviewRequestEmail({ to: customer.email, customerName: customer.name || '', bookingId: b.id }) }
      catch (e) { console.error('[review-requests] email failed:', e) }
    }
    asked++
  }

  // ── Pass 2: one email follow-up (asked 3-7 days ago, never clicked) ────────
  const { data: pending } = await supabase
    .from('bookings')
    .select('id, customers ( name, email )')
    .not('review_request_sent_at', 'is', null)
    .is('review_followup_sent_at', null)
    .is('review_clicked_at', null)
    .gte('review_request_sent_at', iso(now - 7 * D))
    .lte('review_request_sent_at', iso(now - 3 * D))

  for (const b of pending ?? []) {
    const customer = Array.isArray(b.customers) ? b.customers[0] : b.customers
    if (!customer?.email) continue

    const { data: claimed } = await supabase.from('bookings')
      .update({ review_followup_sent_at: new Date().toISOString() })
      .eq('id', b.id)
      .is('review_followup_sent_at', null)
      .select('id')
    if (!claimed?.length) continue

    try {
      await sendReviewFollowupEmail({ to: customer.email, customerName: customer.name || '', bookingId: b.id })
      followedUp++
    } catch (e) { console.error('[review-requests] follow-up failed:', e) }
  }

  return NextResponse.json({ ok: true, asked, followedUp, deduped })
}
