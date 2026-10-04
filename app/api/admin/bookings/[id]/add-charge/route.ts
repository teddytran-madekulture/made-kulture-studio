import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { Client, Environment } from 'square'
import { createClient } from '@supabase/supabase-js'
import { sendSMSResult } from '@/lib/sms'
import { sendOwnerPush } from '@/lib/push'
import { randomUUID } from 'crypto'
import { findOrCreateSquareCustomer } from '@/lib/square-customer'
import { getCreditBalance, redeemCredit } from '@/lib/credits'
import { authUserIdForEmail, rewardFor, addRewardForCharge } from '@/lib/rewards'

// POST /api/admin/bookings/[id]/add-charge
// Charge a customer for equipment they used and/or any one-off fee — AFTER THE
// FACT (works on past bookings too). Records each line on booking_add_ons, bumps
// the booking total, logs a customer note, and (optionally) texts a receipt.
//
// Payment source, in priority order:
//   1. sourceId                      — a keyed-in card nonce (Web Payments),
//                                       optionally saved on file for next time
//   2. squareCardId + squareCustomerId — a specific saved card picked in the UI
//   3. the booking's card on file    — square_card_on_file_id + customer square id

const square = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN!,
  environment: process.env.SQUARE_ENVIRONMENT === 'production'
    ? Environment.Production : Environment.Sandbox,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface RawLine {
  label?: string
  amount?: number | string       // total for the line (unit rate × qty, or a flat fee)
  equipmentId?: string | null
  unitRate?: number | string     // per-unit price (equipment lines)
  quantity?: number | string
  /** Studio time billed here (overtime CHARGE NOW) earns rewards like gear. Fees don't. */
  earns?: boolean
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const {
      lines,             // RawLine[] — equipment + free-form charges
      sourceId,          // keyed-in card nonce (optional)
      saveCard,          // save the keyed card on file (optional)
      squareCardId,      // a chosen saved card (optional)
      squareCustomerId,  // its owning Square customer (optional)
      customerId,        // supabase customers.id (for saving a keyed card)
      email,
      phone,
      customerName,
      sendSms,
      useCredit,         // spend the customer's studio credit first (migration 112)
    } = await req.json()

    // ── Validate + normalize the line items ──────────────────────────────────
    if (!Array.isArray(lines) || lines.length === 0) {
      return NextResponse.json({ error: 'Add at least one item to charge.' }, { status: 400 })
    }
    const clean = (lines as RawLine[]).map(l => {
      const quantity = l.quantity != null ? Math.max(1, Math.floor(Number(l.quantity))) : 1
      return {
        label:       String(l.label ?? '').trim() || 'Charge',
        amount:      Math.round((Number(l.amount) || 0) * 100) / 100,
        equipmentId: l.equipmentId || null,
        unitRate:    l.unitRate != null ? Number(l.unitRate) : null,
        quantity,
        earns:       !!l.earns,
      }
    })
    if (clean.some(l => !(l.amount > 0))) {
      return NextResponse.json({ error: 'Every line needs an amount over $0.' }, { status: 400 })
    }
    const total = Math.round(clean.reduce((s, l) => s + l.amount, 0) * 100) / 100
    if (total <= 0) return NextResponse.json({ error: 'Total must be greater than $0.' }, { status: 400 })

    // ── Load the booking + customer ──────────────────────────────────────────
    const { data: booking } = await supabase
      .from('bookings')
      .select(`id, start_time, total_amount, square_card_on_file_id, customer_id, auth_user_id,
               reward_rate, reward_basis_cents, reward_paid_at,
               customers ( id, name, email, phone, square_customer_id )`)
      .eq('id', params.id)
      .single()

    if (!booking) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    const customer = booking.customers as any
    const totalCents = Math.round(total * 100)

    // ── Studio credit (rewards spent first — lib/rewards splitPots) ──────────
    //     Worked out BEFORE the card so the card is charged only the remainder.
    //     The ledger row is written only AFTER the card succeeds, so a decline
    //     never consumes credit.
    let creditUserId: string | null = null
    let creditCents = 0
    if (useCredit) {
      creditUserId = booking.auth_user_id ?? await authUserIdForEmail(supabase, customer?.email ?? email)
      if (!creditUserId) return NextResponse.json({ error: 'This customer has no account, so there is no studio credit to use.' }, { status: 400 })
      const bal = await getCreditBalance(creditUserId)
      creditCents = Math.max(0, Math.min(bal, totalCents))
      if (creditCents <= 0) return NextResponse.json({ error: 'They have no studio credit left.' }, { status: 400 })
    }
    const cardCents = totalCents - creditCents

    // ── Resolve the charge source ────────────────────────────────────────────
    let chargeSource: string | null = null
    let chargeCustomerId: string | undefined
    let savedCardId: string | null = null

    if (sourceId) {
      // Keyed-in card. Optionally save it on file first (single-use nonce →
      // stored card), then charge the stored card so it's reusable next time.
      const custRowId = customerId || booking.customer_id
      if (saveCard && custRowId) {
        const { data: cust } = await supabase
          .from('customers')
          .select('id, name, email, phone, square_customer_id')
          .eq('id', custRowId)
          .maybeSingle()
        if (cust) {
          let sqCustId: string | null = cust.square_customer_id ?? null
          if (!sqCustId) {
            sqCustId = await findOrCreateSquareCustomer(square, {
              email: cust.email ?? email,
              name:  cust.name ?? customerName,
              phone: cust.phone ?? phone,
            })
            if (sqCustId) await supabase.from('customers').update({ square_customer_id: sqCustId }).eq('id', cust.id)
          }
          if (sqCustId) {
            const cardRes = await square.cardsApi.createCard({
              idempotencyKey: randomUUID(),
              sourceId,                       // consumes the nonce
              card: { customerId: sqCustId },
            })
            savedCardId = cardRes.result.card?.id ?? null
            if (savedCardId) {
              chargeSource     = savedCardId
              chargeCustomerId = sqCustId
              await supabase.from('customers').update({ square_card_id: savedCardId }).eq('id', cust.id)
              await supabase.from('bookings').update({ square_card_on_file_id: savedCardId }).eq('id', booking.id)
            }
          }
        }
      }
      if (!chargeSource) chargeSource = sourceId  // charge the nonce directly
    } else if (squareCardId && squareCustomerId) {
      chargeSource = squareCardId
      chargeCustomerId = squareCustomerId
    } else if (booking.square_card_on_file_id && customer?.square_customer_id) {
      chargeSource = booking.square_card_on_file_id
      chargeCustomerId = customer.square_customer_id
    }

    if (!chargeSource && cardCents > 0) {
      return NextResponse.json({ error: 'No card on file for this booking — key a card in.' }, { status: 400 })
    }

    // ── Charge (only the part credit doesn't cover) ─────────────────────────
    const summary = clean.map(l => (l.quantity > 1 ? `${l.quantity}× ${l.label}` : l.label)).join(', ')
    let squarePaymentId: string | null = null
    if (cardCents > 0) {
      const { result } = await square.paymentsApi.createPayment({
        sourceId:          chargeSource!,
        idempotencyKey:    randomUUID(),
        amountMoney:       { amount: BigInt(cardCents), currency: 'USD' },
        ...(chargeCustomerId ? { customerId: chargeCustomerId } : {}),
        locationId:        process.env.SQUARE_LOCATION_ID!,
        note:              `Made Kulture — ${summary}${creditCents ? ` (+$${(creditCents / 100).toFixed(2)} studio credit)` : ''}`.slice(0, 500),
        buyerEmailAddress: (customer?.email || email) || undefined,
      })
      squarePaymentId = result.payment!.id!
    }

    // ── Spend the credit (now that the card, if any, went through) ──────────
    let creditWarning: string | null = null
    if (creditUserId && creditCents > 0) {
      const { appliedCents } = await redeemCredit(creditUserId, creditCents, { bookingId: booking.id, reason: `Applied to ${summary}` })
      if (appliedCents !== creditCents) {
        creditWarning = `Only $${(appliedCents / 100).toFixed(2)} of the $${(creditCents / 100).toFixed(2)} credit could be taken — the balance moved. Collect the difference by hand.`
        console.error('[add-charge] credit redemption mismatch', { wanted: creditCents, applied: appliedCents })
        await sendOwnerPush({ title: '⚠️ Credit short on add-on', body: creditWarning, url: '/admin/dashboard' }).catch(() => {})
      }
    }

    // Credit share per line (proportional; the last line takes the rounding),
    // so removing one line later returns exactly its credit part.
    const lineCents = clean.map(l => Math.round(l.amount * 100))
    let left = creditCents
    const lineCredit = lineCents.map((c, i) => {
      if (i === lineCents.length - 1) return left
      const share = Math.min(left, Math.round(creditCents * c / totalCents)); left -= share; return share
    })

    // ── Record the line items on the booking (best-effort) ──────────────────
    // booking_add_ons.rate is per-unit: equipment stores its unit rate; a
    // free-form line stores its flat amount as the rate with quantity 1.
    // ⚠️ `paid` defaults to FALSE on booking_add_ons (migration 005). These lines
    // have just been paid for, so they must say so explicitly — otherwise the card
    // is charged and the dashboard prints "(UNPAID)" beside the gear forever.
    const rows = clean.map(l => ({
      booking_id:   booking.id,
      equipment_id: l.equipmentId,
      quantity:     l.quantity,
      rate:         l.equipmentId && l.unitRate != null ? l.unitRate : l.amount,
      paid:         true,
      // The label was already being computed for Square's note and the customer
      // note — it just never landed on the row, so a non-equipment charge showed
      // in the dashboard as the word "Item" and became unidentifiable later.
      label:        l.label || null,
      // Migration 112: what this line took from studio credit, and the card
      // payment it came from — so the desk's "remove" can undo each part.
      credit_cents:    lineCredit[clean.indexOf(l)],
      square_order_id: squarePaymentId,
    }))
    // ⚠️ try/catch was DEAD CODE here — supabase-js resolves with an `error`
    // property rather than throwing, so a rejected insert vanished silently after
    // the card had already been charged. Read `error`.
    const { error: addOnErr } = await supabase.from('booking_add_ons').insert(rows)
    if (addOnErr) console.error('[add-charge] add_ons insert failed', addOnErr)

    // Gear and studio time (overtime) paid by CARD earn rewards; fees and the
    // credit-paid part don't. Before tonight's payout this grows the basis;
    // after it, a top-up is posted (lib/rewards addRewardForCharge).
    {
      const earnCardCents = clean.reduce((s, l, i) => s + ((l.equipmentId || l.earns) ? lineCents[i] - lineCredit[i] : 0), 0)
      if (earnCardCents > 0) await addRewardForCharge(supabase, booking.id, earnCardCents, 'added charge')
    }

    // ── Reflect the charge on the booking total ─────────────────────────────
    // The money is already gone, so this write is verified, not assumed: an
    // RLS-blocked update returns error:null having matched zero rows, so only the
    // .select() proves it landed. A silent miss means the customer paid and the
    // booking still shows the old price.
    const bumped = Math.round(((Number(booking.total_amount) || 0) + total) * 100) / 100
    let totalWarning: string | null = null
    const { data: upRows, error: upErr } = await supabase
      .from('bookings')
      .update({ total_amount: bumped })
      .eq('id', booking.id)
      .select('id')

    if (upErr || !upRows?.length) {
      console.error('[add-charge] CRITICAL: charged but total_amount not updated', upErr)
      totalWarning = `Card charged $${total.toFixed(2)} (${squarePaymentId}) but the booking total did not update — fix it by hand.`
      await sendOwnerPush({
        title: '⚠️ Charged, total not updated',
        body:  `$${total.toFixed(2)} taken for ${summary} but booking ${booking.id} total didn't move. Payment ${squarePaymentId}.`,
        url:   '/admin/dashboard',
      }).catch(() => {})
    }

    // ── Log a customer note ──────────────────────────────────────────────────
    if (booking.customer_id) {
      const dateLabel = new Date(booking.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      await supabase.from('customer_notes').insert({
        customer_id: booking.customer_id,
        tag:         'note',
        note:        `${creditCents ? `$${(creditCents / 100).toFixed(2)} from studio credit${cardCents ? ` + $${(cardCents / 100).toFixed(2)} charged` : ''}` : `Charged $${total.toFixed(2)}`} for ${summary} on the ${dateLabel} booking${savedCardId ? ' (keyed card, saved on file)' : ''}.`,
      })
    }

    // ── Optional confirmation SMS ────────────────────────────────────────────
    let smsError: string | null = null
    const toPhone = phone || customer?.phone
    if (sendSms && toPhone) {
      const paid = creditCents
        ? `$${(creditCents / 100).toFixed(2)} from your studio credit${cardCents ? ` and $${(cardCents / 100).toFixed(2)} charged to your card` : ''}`
        : `we've charged $${total.toFixed(2)}`
      const r = await sendSMSResult(toPhone, `Made Kulture: Hi ${customer?.name || customerName || 'there'}, ${creditCents ? `we've used ${paid}` : paid} for ${summary}. Questions? Text (832) 408-1631.`)
      if (!r.ok) smsError = r.error ?? 'SMS failed to send'
    }

    return NextResponse.json({ success: true, squarePaymentId, cardSaved: !!savedCardId, total, creditCents, cardCents, smsError, totalWarning, creditWarning })
  } catch (err: any) {
    console.error('[add-charge] error:', err)
    const msg = err?.errors?.[0]?.detail || err?.message || 'Charge failed'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
