// Session extension — the customer's own-phone confirm-and-pay endpoint.
// GET  → details for the /extend/[token] page
// POST → re-validate, charge the card on file, extend the booking, sync calendar.

import { NextRequest, NextResponse } from 'next/server'
import { Client, Environment } from 'square'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { planExtension } from '@/lib/extensions'
import { patchCalendarEvent } from '@/lib/gcal'
import { createBookingPin, createBackDoorPin } from '@/lib/igloohome'
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

  // Resolve the card + its OWNING Square customer. Saved cards can live on
  // either identity (guest "customers" record or the account profile), and a
  // booking's stored card id may belong to the OTHER identity than the guest
  // record — Square rejects mismatched pairs with "Payment on file not found".
  // So: list cards on every candidate customer and pair by actual ownership.
  const candidates: string[] = []
  if (customer?.square_customer_id) candidates.push(customer.square_customer_id)

  let profileUserId: string | null = b.auth_user_id ?? null
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

  let sourceCardId: string | null = null
  let chargeCustomerId: string | null = null
  let fallbackCard: { cardId: string; customerId: string } | null = null

  for (const cid of candidates) {
    try {
      const { result } = await square.cardsApi.listCards(undefined, cid)
      const cards = (result.cards ?? []).filter((c: any) => c.enabled !== false)
      // Best case: this customer owns the exact card stored on the booking.
      const bookingCard = b.square_card_on_file_id ? cards.find((c: any) => c.id === b.square_card_on_file_id) : null
      if (bookingCard) { sourceCardId = bookingCard.id!; chargeCustomerId = cid; break }
      if (!fallbackCard && cards[0]?.id) fallbackCard = { cardId: cards[0].id, customerId: cid }
    } catch (e) {
      console.error('[extension] card lookup failed for customer', cid, e)
    }
  }
  if (!sourceCardId && fallbackCard) {
    sourceCardId = fallbackCard.cardId
    chargeCustomerId = fallbackCard.customerId
  }
  console.log('[extension] candidates:', candidates.length, 'matchedBookingCard:', !!(sourceCardId && b.square_card_on_file_id === sourceCardId), 'usedFallback:', !!(sourceCardId && fallbackCard && sourceCardId === fallbackCard.cardId))

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
      customerId: chargeCustomerId,
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

  // Calendar + door code + receipt + owner ping — all non-fatal.
  if (b.gcal_event_id) {
    try { await patchCalendarEvent(b.gcal_event_id, { endISO: p.newEndISO }) }
    catch (e) { console.error('[extension] gcal patch error:', e) }
  }

  // Door code: the original algoPIN expires at the old end time — mint a fresh
  // one covering the extended window so the guest can still get back in. Refresh
  // whichever locks the booking already had a code on (front and/or back).
  let newDoorCode: string | null = null
  let newDoorCodeBack: string | null = null
  if (b.door_code) {
    try {
      const pin = await createBookingPin({
        startISO: b.start_time,
        endISO: p.newEndISO,
        accessName: `MK ext ${p.customerName}`.slice(0, 40),
      })
      if (pin) {
        newDoorCode = pin.pin
        await db.from('bookings')
          .update({ door_code: pin.pin, door_code_pin_id: pin.pinId })
          .eq('id', r.booking_id)
      }
    } catch (e) {
      console.error('[extension] door code refresh error (non-fatal):', e)
    }
  }
  if (b.door_code_back) {
    try {
      const pinBack = await createBackDoorPin({
        startISO: b.start_time,
        endISO: p.newEndISO,
        accessName: `MK ext ${p.customerName} back`.slice(0, 40),
      })
      if (pinBack) {
        newDoorCodeBack = pinBack.pin
        await db.from('bookings')
          .update({ door_code_back: pinBack.pin, door_code_back_pin_id: pinBack.pinId })
          .eq('id', r.booking_id)
      }
    } catch (e) {
      console.error('[extension] back-door code refresh error (non-fatal):', e)
    }
  }

  const untilLabel = centralLabel(p.newEndISO)
  if (p.customerPhone) {
    await sendSMS(
      p.customerPhone,
      `✅ Done! ${p.setName} is yours until ${untilLabel}. $${(r.amount_cents / 100).toFixed(2)} charged to your card on file.` +
      (newDoorCode ? `\n🔑 Updated front-door code (valid to ${untilLabel}): ${newDoorCode}` : '') +
      (newDoorCodeBack ? `\n🔑 Updated back-door code (valid to ${untilLabel}): ${newDoorCodeBack}` : '') +
      `\n— Made Kulture`
    ).catch(e => console.error('[extension] receipt SMS error:', e))
  }
  await sendOwnerPush({
    title: '⏰ Session extended',
    body: `${p.customerName} +${r.hours}hr on ${p.setName} until ${untilLabel} — $${(r.amount_cents / 100).toFixed(2)} charged.`,
    url: '/admin/dashboard',
  }).catch(() => {})

  return NextResponse.json({ success: true, until: untilLabel })
}
