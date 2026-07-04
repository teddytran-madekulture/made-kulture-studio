// Delegated payment — the payer's public pay page endpoint.
// GET  → booking summary + status + expiry for /pay/[token].
// POST → charge the payer's card (Square nonce), confirm the held booking,
//        run the finalize chain, and receipt both sides.

import { NextRequest, NextResponse } from 'next/server'
import { Client, Environment } from 'square'
import { createClient } from '@supabase/supabase-js'
import { finalizeBooking, normalizePhone } from '@/lib/booking-core'
import { sendSMS } from '@/lib/sms'
import { sendSimpleEmail } from '@/lib/email'
import { sendOwnerPush } from '@/lib/push'

const square = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN!,
  environment: process.env.SQUARE_ENVIRONMENT === 'production' ? Environment.Production : Environment.Sandbox,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function centralLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso))
}

async function loadDelegation(token: string) {
  const { data } = await supabase
    .from('payment_delegations')
    .select('id, order_group, booking_ids, payer_name, payer_contact, channel, amount_cents, status, square_payment_id, booker_name, booker_phone, expires_at')
    .eq('pay_token', token)
    .maybeSingle()
  return data
}

async function summarize(bookingIds: string[]) {
  const { data: rows } = await supabase
    .from('bookings')
    .select('id, start_time, end_time, status, sets(name)')
    .in('id', bookingIds)
  return (rows ?? []).map((r: any) => {
    const s = Array.isArray(r.sets) ? r.sets[0] : r.sets
    return {
      setName: s?.name ?? 'Full Studio Takeover',
      start: centralLabel(r.start_time),
      end: new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(new Date(r.end_time)),
      status: r.status,
    }
  })
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const d = await loadDelegation(params.token)
  if (!d) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const expired = d.status === 'pending' && Date.parse(d.expires_at) < Date.now()
  const lines = await summarize(d.booking_ids)

  return NextResponse.json({
    request: {
      status: expired ? 'expired' : d.status,
      amount: (d.amount_cents / 100).toFixed(2),
      expiresAt: d.expires_at,
      payerName: d.payer_name,
      bookerName: d.booker_name,
      lines,
    },
  })
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const body = await req.json().catch(() => ({}))
  const sourceId = body?.sourceId as string | undefined

  const d = await loadDelegation(params.token)
  if (!d) return NextResponse.json({ error: 'Payment request not found.' }, { status: 404 })
  if (d.status === 'paid') return NextResponse.json({ success: true, already: true })
  if (d.status !== 'pending') return NextResponse.json({ error: 'This payment link is no longer active.' }, { status: 409 })
  if (Date.parse(d.expires_at) < Date.now()) {
    await supabase.from('payment_delegations').update({ status: 'expired' }).eq('id', d.id)
    await supabase.from('bookings').update({ status: 'cancelled' }).in('id', d.booking_ids).eq('status', 'pending_payment')
    return NextResponse.json({ error: 'This link timed out — ask whoever sent it to resend a fresh one.' }, { status: 410 })
  }
  if (!sourceId) return NextResponse.json({ error: 'Card details are required.' }, { status: 400 })

  // Guard: the held rows must still be pending_payment (not swept/cancelled).
  const { data: heldRows } = await supabase
    .from('bookings').select('id, status').in('id', d.booking_ids)
  const stillHeld = (heldRows ?? []).filter(r => r.status === 'pending_payment').map(r => r.id)
  if (stillHeld.length === 0) {
    await supabase.from('payment_delegations').update({ status: 'cancelled' }).eq('id', d.id)
    return NextResponse.json({ error: 'This hold was released — the slot is no longer reserved.' }, { status: 409 })
  }

  // Charge the payer's card nonce directly (no saved card needed for a third party).
  const isEmail = d.channel === 'email'
  let paymentId: string | null = null
  try {
    const { result } = await square.paymentsApi.createPayment({
      sourceId,
      idempotencyKey: d.id, // one charge per delegation, even on double-submit
      amountMoney: { amount: BigInt(d.amount_cents), currency: 'USD' },
      locationId: process.env.SQUARE_LOCATION_ID!,
      note: `Made Kulture — booking for ${d.booker_name || 'guest'} (paid by ${d.payer_name || 'third party'})`,
      buyerEmailAddress: isEmail ? d.payer_contact : undefined,
    })
    paymentId = result.payment?.id ?? null
  } catch (e: any) {
    console.error('[pay] charge failed', e)
    return NextResponse.json({ error: e?.errors?.[0]?.detail || 'Card was declined — try another card.' }, { status: 402 })
  }

  // Confirm the held rows.
  const { error: upErr } = await supabase
    .from('bookings')
    .update({ status: 'confirmed', square_payment_id: paymentId })
    .in('id', d.booking_ids)
  if (upErr) {
    console.error('[pay] CRITICAL: charged but confirm failed', upErr)
    await supabase.from('payment_delegations').update({ status: 'failed', square_payment_id: paymentId }).eq('id', d.id)
    await sendOwnerPush({
      title: '⚠️ Delegated payment charged but NOT confirmed',
      body: `${d.payer_name || 'Someone'} paid $${(d.amount_cents / 100).toFixed(2)} for ${d.booker_name || 'a booking'} but the confirm failed — fix manually.`,
      url: '/admin/dashboard',
    }).catch(() => {})
    return NextResponse.json({ error: 'Payment went through but confirming the booking hit a snag — the team has been alerted and will sort it out.' }, { status: 500 })
  }

  await supabase.from('booking_add_ons').update({ paid: true }).in('booking_id', d.booking_ids)
  await supabase.from('payment_delegations').update({ status: 'paid', square_payment_id: paymentId }).eq('id', d.id)

  // Door code + calendar + booker confirmations (non-fatal inside).
  let doorCode: string | null = null
  try {
    const r = await finalizeBooking(supabase, d.booking_ids)
    doorCode = r.doorCode
  } catch (e) {
    console.error('[pay] finalize error (non-fatal):', e)
  }

  // Receipt to the PAYER.
  const dollars = (d.amount_cents / 100).toFixed(2)
  try {
    if (isEmail) {
      await sendSimpleEmail({
        to: d.payer_contact,
        subject: `Payment received — Made Kulture ($${dollars})`,
        heading: 'Thanks — payment received',
        paragraphs: [
          `Your $${dollars} payment for ${d.booker_name || 'the'} booking is confirmed.`,
          `${d.booker_name || 'The booker'} has the booking details and door code. Nothing else needed from you.`,
        ],
        label: 'delegated_receipt',
      })
    } else {
      await sendSMS(
        normalizePhone(d.payer_contact),
        `✅ Payment received — $${dollars} for ${d.booker_name || 'the'} Made Kulture booking is confirmed. Thanks!\n— Made Kulture`
      )
    }
  } catch (e) {
    console.error('[pay] payer receipt error:', e)
  }

  return NextResponse.json({ success: true })
}
