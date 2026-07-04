// Session extension — the customer's own-phone confirm-and-pay endpoint.
// GET  → details for the /extend/[token] page
// POST → re-validate, charge the card on file, extend the booking, sync calendar.

import { NextRequest, NextResponse } from 'next/server'
import { Client, Environment } from 'square'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { planExtension } from '@/lib/extensions'
import { patchCalendarEvent } from '@/lib/gcal'
import { sendSMS } from '@/lib/sms'
import { sendOwnerPush } from '@/lib/push'

const square = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN!,
  environment: process.env.SQUARE_ENVIRONMENT === 'production' ? Environment.Production : Environment.Sandbox,
})

function centralLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso))
}

async function findRequest(token: string) {
  const db = supabaseAdmin()
  const { data } = await db
    .from('extension_requests')
    .select('id, booking_id, hours, amount_cents, status, expires_at, payment_id')
    .eq('confirm_token', token)
    .maybeSingle()
  return data
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const r = await findRequest(params.token)
  if (!r) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const expired = r.status === 'pending' && Date.parse(r.expires_at) < Date.now()
  const p = await planExtension(r.booking_id, r.hours)
  const base: any = {
    hours: r.hours,
    amount: (r.amount_cents / 100).toFixed(2),
    status: expired ? 'expired' : r.status,
  }
  if (!('error' in p)) {
    base.setName = p.setName
    base.newEndLabel = centralLabel(p.newEndISO)
    base.conflict = p.conflict
  }
  return NextResponse.json({ request: base })
}

export async function POST(_req: NextRequest, { params }: { params: { token: string } }) {
  const db = supabaseAdmin()
  const r = await findRequest(params.token)
  if (!r) return NextResponse.json({ error: 'Request not found.' }, { status: 404 })
  if (r.status === 'confirmed') return NextResponse.json({ success: true, already: true })
  if (r.status !== 'pending') return NextResponse.json({ error: 'This request is no longer active.' }, { status: 409 })
  if (Date.parse(r.expires_at) < Date.now()) {
    await db.from('extension_requests').update({ status: 'expired' }).eq('id', r.id)
    return NextResponse.json({ error: 'This link expired — ask June at the kiosk to send a fresh one.' }, { status: 410 })
  }

  // Re-plan at confirm time: schedule may have changed in the last 15 minutes.
  const p = await planExtension(r.booking_id, r.hours)
  if ('error' in p) return NextResponse.json({ error: p.error }, { status: 400 })
  if (p.conflict) {
    await db.from('extension_requests').update({ status: 'cancelled' }).eq('id', r.id)
    return NextResponse.json({ error: 'The set was just booked after your session — the extension is no longer available.' }, { status: 409 })
  }
  if (!p.hasCardOnFile) return NextResponse.json({ error: 'No card on file — text (832) 408-1631.' }, { status: 400 })

  const b = p.booking as any
  const customer = b.customers as any

  // Resolve the card. Saved cards can live on EITHER Square customer identity:
  // the guest "customers" record (booking flow) or the logged-in account
  // profile (customer_profiles). Check both.
  let sourceCardId: string | null = null
  let chargeCustomerId: string | null = null

  if (b.square_card_on_file_id && customer?.square_customer_id) {
    sourceCardId = b.square_card_on_file_id
    chargeCustomerId = customer.square_customer_id
  } else {
    const candidates: string[] = []
    if (customer?.square_customer_id) candidates.push(customer.square_customer_id)

    // Account profile via the booking's login…
    let profileUserId: string | null = b.auth_user_id ?? null
    // …or, when the booking wasn't made logged-in, via the auth account that
    // shares the booking's email (same lookup the checkout flow uses).
    if (!profileUserId && customer?.email) {
      try {
        const { data: authUsers } = await (db as any).auth.admin.listUsers()
        const match = authUsers?.users?.find((u: any) => u.email?.toLowerCase() === String(customer.email).toLowerCase())
        profileUserId = match?.id ?? null
      } catch (e) {
        console.error('[extension] auth email lookup failed', e)
      }
    }
    if (profileUserId) {
      const { data: prof } = await db
        .from('customer_profiles').select('square_customer_id').eq('id', profileUserId).maybeSingle()
      if (prof?.square_customer_id && !candidates.includes(prof.square_customer_id)) {
        candidates.push(prof.square_customer_id)
      }
    }
    console.log('[extension] card candidates:', candidates.length, 'authUser:', !!b.auth_user_id, 'emailPath:', !b.auth_user_id && !!customer?.email)
    for (const cid of candidates) {
      try {
        const { result } = await square.cardsApi.listCards(undefined, cid)
        const card = (result.cards ?? []).find((c: any) => c.enabled !== false)
        if (card?.id) { sourceCardId = card.id; chargeCustomerId = cid; break }
      } catch (e) {
        console.error('[extension] card lookup failed for customer', cid, e)
      }
    }
  }

  if (!sourceCardId || !chargeCustomerId) {
    return NextResponse.json({ error: 'No saved card found on your account — text (832) 408-1631 and we\'ll sort it out.' }, { status: 400 })
  }

  // Charge the card on file (price locked at request time).
  let paymentId: string | null = null
  try {
    const { result } = await square.paymentsApi.createPayment({
      sourceId: sourceCardId,
      idempotencyKey: r.id, // one charge per request, even on double-tap
      amountMoney: { amount: BigInt(r.amount_cents), currency: 'USD' },
      customerId: customer.square_customer_id,
      locationId: process.env.SQUARE_LOCATION_ID!,
      note: `Made Kulture — +${r.hours}hr ${p.setName} (self-serve extension)`,
      buyerEmailAddress: customer?.email || undefined,
    })
    paymentId = result.payment?.id ?? null
  } catch (e: any) {
    console.error('[extension] charge failed', e)
    await db.from('extension_requests').update({ status: 'failed' }).eq('id', r.id)
    return NextResponse.json({ error: e?.errors?.[0]?.detail || 'Card charge failed — text (832) 408-1631.' }, { status: 402 })
  }

  // Extend the booking.
  const newTotal = b.total_amount != null ? Number(b.total_amount) + r.amount_cents / 100 : null
  const { error: upErr } = await db.from('bookings')
    .update({ end_time: p.newEndISO, ...(newTotal != null ? { total_amount: newTotal } : {}) })
    .eq('id', r.booking_id)
  if (upErr) {
    console.error('[extension] CRITICAL: charged but extend failed', upErr)
    await db.from('extension_requests').update({ status: 'failed', payment_id: paymentId }).eq('id', r.id)
    await sendOwnerPush({
      title: '⚠️ Extension charged but NOT applied',
      body: `${p.customerName} paid $${(r.amount_cents / 100).toFixed(2)} for +${r.hours}hr on ${p.setName} but the booking update failed — fix manually.`,
      url: '/admin/dashboard',
    }).catch(() => {})
    return NextResponse.json({ error: 'Payment went through but the schedule update hit a snag — the team has been alerted and will sort it out.' }, { status: 500 })
  }

  await db.from('extension_requests')
    .update({ status: 'confirmed', payment_id: paymentId })
    .eq('id', r.id)

  // Calendar + receipt + owner ping — all non-fatal.
  if (b.gcal_event_id) {
    try { await patchCalendarEvent(b.gcal_event_id, { endISO: p.newEndISO }) }
    catch (e) { console.error('[extension] gcal patch error:', e) }
  }
  const untilLabel = centralLabel(p.newEndISO)
  if (p.customerPhone) {
    await sendSMS(
      p.customerPhone,
      `✅ Done! ${p.setName} is yours until ${untilLabel}. $${(r.amount_cents / 100).toFixed(2)} charged to your card on file. — Made Kulture`
    ).catch(e => console.error('[extension] receipt SMS error:', e))
  }
  await sendOwnerPush({
    title: '⏰ Session extended',
    body: `${p.customerName} +${r.hours}hr on ${p.setName} until ${untilLabel} — $${(r.amount_cents / 100).toFixed(2)} charged.`,
    url: '/admin/dashboard',
  }).catch(() => {})

  return NextResponse.json({ success: true, until: untilLabel })
}
