// GET /api/cron/payment-holds  (pg_cron, every minute, Bearer CRON_SECRET)
// Two passes over delegated-payment holds:
//   1. Reminder — ~10 min before expiry, nudge the payer once.
//   2. Expire   — past expiry, cancel the held booking rows (frees the slot) and
//                 tell the booker they can try again / pay it themselves.
// Vercel Hobby crons are daily-only, so this is driven by pg_cron (same as
// session-reminder). See migration 056 for the schedule snippet.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSMS } from '@/lib/sms'
import { sendSimpleEmail } from '@/lib/email'
import { sendOwnerPush } from '@/lib/push'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')
const REMINDER_WINDOW_MS = 10 * 60 * 1000

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = Date.now()
  let reminded = 0
  let expired = 0

  // ── 1. Reminders: pending, no reminder yet, expiring within 10 min ─────────
  const { data: soon } = await supabase
    .from('payment_delegations')
    .select('id, payer_contact, channel, amount_cents, booker_name, expires_at, pay_token')
    .eq('status', 'pending')
    .is('reminder_sent_at', null)
    .lte('expires_at', new Date(now + REMINDER_WINDOW_MS).toISOString())
    .gt('expires_at', new Date(now).toISOString())

  for (const d of soon ?? []) {
    const minsLeft = Math.max(1, Math.round((Date.parse(d.expires_at) - now) / 60000))
    const dollars = (d.amount_cents / 100).toFixed(2)
    const payUrl = `${APP_URL}/pay/${d.pay_token}`
    try {
      if (d.channel === 'sms') {
        await sendSMS(d.payer_contact, `⏳ ~${minsLeft} min left to pay $${dollars} for ${d.booker_name || 'the'} Made Kulture booking before the slot reopens: ${payUrl}`)
      } else {
        await sendSimpleEmail({
          to: d.payer_contact,
          subject: `~${minsLeft} min left — Made Kulture booking ($${dollars})`,
          heading: `About ${minsLeft} minutes left`,
          paragraphs: [`The slot for ${d.booker_name || 'this'} booking is still held, but not for long. Pay $${dollars} before the timer runs out to lock it in.`],
          ctaText: 'Pay now', ctaUrl: payUrl, label: 'delegated_reminder',
        })
      }
      await supabase.from('payment_delegations').update({ reminder_sent_at: new Date().toISOString() }).eq('id', d.id)
      reminded++
    } catch (e) {
      console.error('[payment-holds] reminder error:', e)
    }
  }

  // ── 2. Expire: pending + past expiry → cancel held rows, notify booker ──────
  const { data: dead } = await supabase
    .from('payment_delegations')
    .select('id, booking_ids, booker_phone, amount_cents, status')
    .eq('status', 'pending')
    .lt('expires_at', new Date(now).toISOString())

  for (const d of dead ?? []) {
    await supabase.from('payment_delegations').update({ status: 'expired' }).eq('id', d.id)
    await supabase.from('bookings')
      .update({ status: 'cancelled' })
      .in('id', d.booking_ids)
      .eq('status', 'pending_payment')  // never touch an already-confirmed row
    expired++

    const dollars = (d.amount_cents / 100).toFixed(2)
    if (d.booker_phone) {
      await sendSMS(
        d.booker_phone,
        `Your Made Kulture hold expired — the $${dollars} payment link wasn’t completed in time and the slot reopened. Want it back? Rebook here: ${APP_URL}/availability`
      ).catch(e => console.error('[payment-holds] booker SMS error:', e))
    }
    await sendOwnerPush({
      title: '⌛ Payment hold expired',
      body: `A $${dollars} delegated hold lapsed unpaid — slot released.`,
      url: '/admin/dashboard',
    }).catch(() => {})
  }

  return NextResponse.json({ success: true, reminded, expired })
}
