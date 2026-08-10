import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { Client, Environment } from 'square'
import { sendSMSResult } from '@/lib/sms'
import { sendOwnerPush } from '@/lib/push'

// GET /api/cron/unpaid-links   (Vercel Cron, daily, Bearer CRON_SECRET)
//
// Chase payment links that were sent and never paid — ONCE, per link.
//
// ⚠️ Why this exists: nothing in the app reminded anyone about an unpaid link,
// and Square links never expire, so one could sit silently forever. A real $80
// link did exactly that. The same nudge-before-it-goes-stale logic already
// existed in /api/cron/payment-holds for delegated payments; it was just never
// wired to the admin payment link, which is the flow actually in daily use.
//
// Deliberately conservative, because this texts real customers unprompted:
//   • ONE nudge per link, ever. Claimed via reminder_sent_at so a retry or an
//     overlapping run cannot double-text.
//   • Only links raised ≥ 48h ago, and only rows with a link_sent_at — every
//     row predating migration 095 is skipped rather than back-dated, or the
//     first run would blast people about weeks-old charges.
//   • Cancelled bookings are skipped. Nobody should be chased for a session
//     that isn't happening.

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const square = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN!,
  environment: process.env.SQUARE_ENVIRONMENT === 'production'
    ? Environment.Production : Environment.Sandbox,
})

const AGE_MS  = 48 * 60 * 60 * 1000
const MAX_RUN = 25          // a sane ceiling on texts sent by one unattended run

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - AGE_MS).toISOString()

  const { data: rows, error } = await supabase
    .from('booking_add_ons')
    .select(`
      id, rate, quantity, label, square_payment_link_id, link_sent_at,
      bookings ( id, status, start_time, customers ( name, phone ) )
    `)
    .eq('paid', false)
    .is('reminder_sent_at', null)
    .not('link_sent_at', 'is', null)
    .not('square_payment_link_id', 'is', null)
    .lte('link_sent_at', cutoff)
    .limit(MAX_RUN)

  // ⚠️ Fail loudly. supabase-js resolves with `error` instead of throwing, so a
  // broken query would otherwise look like a clean run that found nothing —
  // which is indistinguishable from "everyone has paid".
  if (error) {
    console.error('[unpaid-links] query failed', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let nudged = 0
  const skipped: string[] = []

  for (const r of rows ?? []) {
    const booking  = (r as any).bookings
    const customer = booking?.customers
    const amount   = Number(r.rate ?? 0) * Number(r.quantity ?? 1)

    if (!booking || booking.status === 'cancelled') { skipped.push(`${r.id}: booking cancelled`); continue }
    if (!customer?.phone)                           { skipped.push(`${r.id}: no phone`);          continue }

    // Fetch the URL from Square rather than storing it: the link is the source
    // of truth for whether it still exists, and a deleted one 404s here instead
    // of us texting a dead URL.
    let url: string | null = null
    try {
      const { result } = await square.checkoutApi.retrievePaymentLink(r.square_payment_link_id!)
      url = result.paymentLink?.url ?? null
    } catch (e: any) {
      skipped.push(`${r.id}: link gone from Square`)
      // Claim it anyway so a dead link isn't retried every night forever.
      await supabase.from('booking_add_ons')
        .update({ reminder_sent_at: new Date().toISOString() })
        .eq('id', r.id).is('reminder_sent_at', null)
      continue
    }
    if (!url) { skipped.push(`${r.id}: no url`); continue }

    // CLAIM BEFORE SENDING. If we texted first and the update then failed, the
    // next run would text them again. Claiming first means the worst case is a
    // missed nudge, not a customer pestered nightly.
    const { data: claimed } = await supabase
      .from('booking_add_ons')
      .update({ reminder_sent_at: new Date().toISOString() })
      .eq('id', r.id)
      .is('reminder_sent_at', null)
      .select('id')

    if (!claimed?.length) { skipped.push(`${r.id}: claimed by another run`); continue }

    const label = (r.label ?? '').trim() || 'your booking'
    const msg = [
      `Hi ${customer.name || 'there'} — just a reminder that $${amount.toFixed(2)} for ${label} at Made Kulture is still outstanding.`,
      ``,
      `You can pay it here:`,
      url,
      ``,
      `Already paid or think this is a mistake? Text (832) 408-1631.`,
    ].join('\n')

    const sms = await sendSMSResult(customer.phone, msg)
    if (sms.ok) {
      nudged++
    } else {
      // ⚠️ lib/sms is the layer where a blocked toll-free number looks identical
      // to no bug, so say so out loud. The row stays claimed — see above.
      console.error(`[unpaid-links] SMS failed for add-on ${r.id}:`, sms.error)
      skipped.push(`${r.id}: SMS failed (${sms.error})`)
    }
  }

  if (skipped.length) console.warn('[unpaid-links] skipped:', skipped)

  // Tell the owner only when something actually went out — a silent no-op run
  // every night is noise, but money being chased in his name is not.
  if (nudged > 0) {
    await sendOwnerPush({
      title: `Chased ${nudged} unpaid payment link${nudged > 1 ? 's' : ''}`,
      body:  'Customers with a link unpaid for 48h+ were texted the link again. One reminder each.',
      url:   '/admin/dashboard',
    }).catch(() => {})
  }

  return NextResponse.json({ ok: true, considered: rows?.length ?? 0, nudged, skipped })
}
