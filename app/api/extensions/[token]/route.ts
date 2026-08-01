// Session extension / overtime — the customer's own-phone confirm-and-pay endpoint.
// GET  → details for the /extend/[token] page
// POST → re-validate, take the money, and (for an extension) move the booking.
//
// TWO KINDS reach this endpoint:
//   'extend'  — future time. Charges, moves end_time, refreshes the door codes,
//               patches the calendar, re-checks staffing coverage.
//   'overage' — time already used. Charges and bumps the booking total, and
//               deliberately touches NOTHING else: no end_time, no door code, no
//               calendar. The set is usually booked right behind them.
//
// TWO WAYS TO PAY: the card on file, or a card the guest keys in right here when
// there isn't one (tokenized by Square in their browser — the raw number never
// reaches this server; we only ever see a single-use nonce).

import { NextRequest, NextResponse } from 'next/server'
import { Client, Environment } from 'square'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { planExtension, durationLabel, type ExtensionKind } from '@/lib/extensions'
import { findOrCreateSquareCustomer } from '@/lib/square-customer'
import { patchCalendarEvent } from '@/lib/gcal'
import { createBookingPin, createBackDoorPin } from '@/lib/igloohome'
import { sendSMS } from '@/lib/sms'
import { sendOwnerPush } from '@/lib/push'
import { notifyCoverageGap } from '@/lib/coverage'

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
    .select('id, booking_id, hours, kind, amount_cents, status, expires_at, payment_id')
    .eq('confirm_token', token)
    .maybeSingle()
  return data
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const r = await findRequest(params.token)
  if (!r) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const hours = Number(r.hours)
  const kind: ExtensionKind = ((r as any).kind as ExtensionKind) ?? 'extend'
  const expired = r.status === 'pending' && Date.parse(r.expires_at) < Date.now()
  const p = await planExtension(r.booking_id, hours, kind)
  const base: any = {
    hours,
    kind,
    durationLabel: durationLabel(hours),
    amount: (r.amount_cents / 100).toFixed(2),
    status: expired ? 'expired' : r.status,
  }
  if (!('error' in p)) {
    base.setName = p.setName
    base.conflict = p.conflict
    base.hasCardOnFile = p.hasCardOnFile
    // Only an extension has a new end time to promise.
    if (kind === 'extend') base.newEndLabel = centralLabel(p.newEndISO)
    else base.bookedEndLabel = centralLabel(p.booking.end_time)
  }
  return NextResponse.json({ request: base })
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const db = supabaseAdmin()
  const r = await findRequest(params.token)
  if (!r) return NextResponse.json({ error: 'Request not found.' }, { status: 404 })
  if (r.status === 'confirmed') return NextResponse.json({ success: true, already: true })
  if (r.status !== 'pending') return NextResponse.json({ error: 'This request is no longer active.' }, { status: 409 })
  if (Date.parse(r.expires_at) < Date.now()) {
    await db.from('extension_requests').update({ status: 'expired' }).eq('id', r.id)
    return NextResponse.json({ error: 'This link expired — text (832) 408-1631 and we\'ll send a fresh one.' }, { status: 410 })
  }

  // A card the guest keyed in on this page, if they had no card on file.
  let body: any = {}
  try { body = await req.json() } catch { /* card-on-file path sends no body */ }
  const keyedSourceId: string | null = body?.sourceId ? String(body.sourceId) : null
  const saveKeyedCard: boolean = body?.saveCard !== false   // default on

  const hours = Number(r.hours)
  const kind: ExtensionKind = ((r as any).kind as ExtensionKind) ?? 'extend'

  // Re-plan at confirm time: the schedule may have changed since the text went out.
  const p = await planExtension(r.booking_id, hours, kind)
  if ('error' in p) return NextResponse.json({ error: p.error }, { status: 400 })
  if (p.conflict) {
    // Only reachable for 'extend' — planExtension never flags a conflict on an
    // overage, because an overage doesn't move anything.
    await db.from('extension_requests').update({ status: 'cancelled' }).eq('id', r.id)
    return NextResponse.json({ error: 'The set was just booked after your session — the extra time is no longer available.' }, { status: 409 })
  }

  const b = p.booking as any
  const customer = b.customers as any

  // ── Resolve how we're taking the money ──────────────────────────────────────
  let sourceCardId: string | null = null
  let chargeCustomerId: string | null = null
  let cardSaved = false

  if (keyedSourceId) {
    // Keyed card. Save it on file first when we can (a single-use nonce becomes
    // a reusable card), then charge the stored card — so the next overage on
    // this customer doesn't need them to key it in again. If saving fails for
    // any reason, fall through and charge the nonce directly rather than
    // failing the payment over a convenience feature.
    if (saveKeyedCard && b.customer_id) {
      try {
        let sqCustId: string | null = customer?.square_customer_id ?? null
        if (!sqCustId) {
          sqCustId = await findOrCreateSquareCustomer(square, {
            email: customer?.email, name: customer?.name, phone: customer?.phone,
          })
          if (sqCustId) await db.from('customers').update({ square_customer_id: sqCustId }).eq('id', b.customer_id)
        }
        if (sqCustId) {
          const cardRes = await square.cardsApi.createCard({
            idempotencyKey: randomUUID(),
            sourceId: keyedSourceId,          // consumes the nonce
            card: { customerId: sqCustId },
          })
          const newCardId = cardRes.result.card?.id ?? null
          if (newCardId) {
            sourceCardId = newCardId
            chargeCustomerId = sqCustId
            cardSaved = true
            await db.from('customers').update({ square_card_id: newCardId }).eq('id', b.customer_id)
            // Only claim the booking's card slot if it was empty — never
            // overwrite the card the session was actually paid with.
            if (!b.square_card_on_file_id) {
              await db.from('bookings').update({ square_card_on_file_id: newCardId }).eq('id', r.booking_id)
            }
          }
        }
      } catch (e) {
        console.error('[extension] save-card failed, charging the nonce directly', e)
      }
    }
    if (!sourceCardId) sourceCardId = keyedSourceId
  } else {
    // Card on file. Resolve the card AND its OWNING Square customer: saved cards
    // can live on either identity (the guest "customers" record or the account
    // profile), and a booking's stored card id may belong to the OTHER identity
    // than the guest record — Square rejects mismatched pairs with "Payment on
    // file not found". So list cards on every candidate and pair by ownership.
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

    if (!sourceCardId) {
      // The page swaps itself for a card field on this signal.
      return NextResponse.json({ error: 'No saved card found on your account.', needsCard: true }, { status: 402 })
    }
  }

  // ── Charge (price locked at request time) ───────────────────────────────────
  const dur = durationLabel(hours)
  const noteText = kind === 'overage'
    ? `Made Kulture — ${dur} overtime, ${p.setName}`
    : `Made Kulture — +${dur} ${p.setName} (self-serve extension)`

  let paymentId: string | null = null
  try {
    const { result } = await square.paymentsApi.createPayment({
      sourceId: sourceCardId!,
      // Stable per (request, payment method): a double-tap on the same card
      // can't charge twice, while keying in a DIFFERENT card after a decline
      // gets its own key and is allowed through.
      idempotencyKey: `${r.id}-${keyedSourceId ? keyedSourceId.slice(-12) : 'cof'}`,
      amountMoney: { amount: BigInt(r.amount_cents), currency: 'USD' },
      ...(chargeCustomerId ? { customerId: chargeCustomerId } : {}),
      locationId: process.env.SQUARE_LOCATION_ID!,
      note: noteText,
      buyerEmailAddress: customer?.email || undefined,
    })
    paymentId = result.payment?.id ?? null
  } catch (e: any) {
    console.error('[extension] charge failed', e)
    // Deliberately left PENDING, not 'failed': a declined or drained card (very
    // common — prepaid cards are the norm with this clientele) should let them
    // try another one on the same link instead of dead-ending it. The expiry
    // still bounds how long that's possible.
    return NextResponse.json({
      error: e?.errors?.[0]?.detail || 'That card was declined — try another card or text (832) 408-1631.',
      canRetry: true,
    }, { status: 402 })
  }

  const amountDollars = r.amount_cents / 100

  // ── Apply it ────────────────────────────────────────────────────────────────
  const newTotal = b.total_amount != null ? Number(b.total_amount) + amountDollars : null

  if (kind === 'extend') {
    const { error: upErr } = await db.from('bookings')
      .update({ end_time: p.newEndISO, ...(newTotal != null ? { total_amount: newTotal } : {}) })
      .eq('id', r.booking_id)
    if (upErr) {
      console.error('[extension] CRITICAL: charged but extend failed', upErr)
      await db.from('extension_requests').update({ status: 'failed', payment_id: paymentId }).eq('id', r.id)
      await sendOwnerPush({
        title: '⚠️ Extension charged but NOT applied',
        body: `${p.customerName} paid $${amountDollars.toFixed(2)} for +${dur} on ${p.setName} but the booking update failed — fix manually.`,
        url: '/admin/dashboard',
      }).catch(() => {})
      return NextResponse.json({ error: 'Payment went through but the schedule update hit a snag — the team has been alerted and will sort it out.' }, { status: 500 })
    }
  } else {
    // Overage: the money is the whole point. end_time stays exactly where it is.
    if (newTotal != null) {
      const { error: upErr } = await db.from('bookings').update({ total_amount: newTotal }).eq('id', r.booking_id)
      if (upErr) {
        // Non-fatal by design: the charge succeeded and the booking window is
        // untouched, so the only casualty is a stale total. Flag it, don't fail.
        console.error('[extension] overage charged but total not updated', upErr)
        await sendOwnerPush({
          title: '⚠️ Overtime charged, total not updated',
          body: `${p.customerName} paid $${amountDollars.toFixed(2)} overtime on ${p.setName} — the booking total didn't update. Payment ${paymentId}.`,
          url: '/admin/dashboard',
        }).catch(() => {})
      }
    }
    if (b.customer_id) {
      try {
        await db.from('customer_notes').insert({
          customer_id: b.customer_id,
          tag: 'note',
          note: `Paid $${amountDollars.toFixed(2)} for ${dur} of overtime on ${p.setName} (confirmed on their own phone)${cardSaved ? ', card saved on file' : ''}.`,
        })
      } catch (e) {
        console.error('[extension] overage note insert failed (non-fatal):', e)
      }
    }
  }

  await db.from('extension_requests')
    .update({ status: 'confirmed', payment_id: paymentId, paid_new_card: !!keyedSourceId })
    .eq('id', r.id)

  // ── Everything below is non-fatal: the money and the booking are already right ──

  const untilLabel = kind === 'extend' ? centralLabel(p.newEndISO) : null

  if (kind === 'extend') {
    if (b.gcal_event_id) {
      try { await patchCalendarEvent(b.gcal_event_id, { endISO: p.newEndISO }) }
      catch (e) { console.error('[extension] gcal patch error:', e) }
    }

    // Door code: the original algoPIN expires at the old end time — mint a fresh
    // one covering the extended window so the guest can still get back in.
    // Refresh whichever locks the booking already had a code on.
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

    if (p.customerPhone) {
      await sendSMS(
        p.customerPhone,
        `✅ Done! ${p.setName} is yours until ${untilLabel}. $${amountDollars.toFixed(2)} charged${keyedSourceId ? '' : ' to your card on file'}.` +
        (newDoorCode ? `\n🔑 Updated front-door code (valid to ${untilLabel}): ${newDoorCode}` : '') +
        (newDoorCodeBack ? `\n🔑 Updated back-door code (valid to ${untilLabel}): ${newDoorCodeBack}` : '') +
        `\n— Made Kulture`
      ).catch(e => console.error('[extension] receipt SMS error:', e))
    }
    await sendOwnerPush({
      title: '⏰ Session extended',
      body: `${p.customerName} +${dur} on ${p.setName} until ${untilLabel} — $${amountDollars.toFixed(2)} charged.`,
      url: '/admin/dashboard',
    }).catch(() => {})

    // The session now runs later than whoever is covering it signed up for —
    // warn if the extra time falls outside every posted shift.
    await notifyCoverageGap(r.booking_id).catch(() => {})
  } else {
    if (p.customerPhone) {
      await sendSMS(
        p.customerPhone,
        `✅ Thanks! $${amountDollars.toFixed(2)} received for ${dur} of overtime on ${p.setName}. We appreciate you settling it.\n— Made Kulture`
      ).catch(e => console.error('[extension] overage receipt SMS error:', e))
    }
    await sendOwnerPush({
      title: '💵 Overtime paid',
      body: `${p.customerName} paid $${amountDollars.toFixed(2)} for ${dur} over on ${p.setName}.`,
      url: '/admin/dashboard',
    }).catch(() => {})
  }

  return NextResponse.json({ success: true, kind, until: untilLabel, cardSaved })
}
