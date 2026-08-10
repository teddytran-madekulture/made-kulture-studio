import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { Client, Environment } from 'square'
import { createClient } from '@supabase/supabase-js'
import { sendSMSResult } from '@/lib/sms'
import { sendOwnerPush } from '@/lib/push'
import { randomUUID } from 'crypto'
import { findOrCreateSquareCustomer } from '@/lib/square-customer'

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
      .select(`id, start_time, total_amount, square_card_on_file_id, customer_id,
               customers ( id, name, email, phone, square_customer_id )`)
      .eq('id', params.id)
      .single()

    if (!booking) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    const customer = booking.customers as any

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

    if (!chargeSource) {
      return NextResponse.json({ error: 'No card on file for this booking — key a card in.' }, { status: 400 })
    }

    // ── Charge ───────────────────────────────────────────────────────────────
    const summary = clean.map(l => (l.quantity > 1 ? `${l.quantity}× ${l.label}` : l.label)).join(', ')
    const { result } = await square.paymentsApi.createPayment({
      sourceId:          chargeSource,
      idempotencyKey:    randomUUID(),
      amountMoney:       { amount: BigInt(Math.round(total * 100)), currency: 'USD' },
      ...(chargeCustomerId ? { customerId: chargeCustomerId } : {}),
      locationId:        process.env.SQUARE_LOCATION_ID!,
      note:              `Made Kulture — ${summary}`.slice(0, 500),
      buyerEmailAddress: (customer?.email || email) || undefined,
    })
    const squarePaymentId = result.payment!.id!

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
    }))
    // ⚠️ try/catch was DEAD CODE here — supabase-js resolves with an `error`
    // property rather than throwing, so a rejected insert vanished silently after
    // the card had already been charged. Read `error`.
    const { error: addOnErr } = await supabase.from('booking_add_ons').insert(rows)
    if (addOnErr) console.error('[add-charge] add_ons insert failed', addOnErr)

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
        note:        `Charged $${total.toFixed(2)} for ${summary} on the ${dateLabel} booking${savedCardId ? ' (keyed card, saved on file)' : ''}.`,
      })
    }

    // ── Optional confirmation SMS ────────────────────────────────────────────
    let smsError: string | null = null
    const toPhone = phone || customer?.phone
    if (sendSms && toPhone) {
      const r = await sendSMSResult(toPhone, `Made Kulture: Hi ${customer?.name || customerName || 'there'}, we've charged $${total.toFixed(2)} for ${summary}. Questions? Text (832) 408-1631.`)
      if (!r.ok) smsError = r.error ?? 'SMS failed to send'
    }

    return NextResponse.json({ success: true, squarePaymentId, cardSaved: !!savedCardId, total, smsError, totalWarning })
  } catch (err: any) {
    console.error('[add-charge] error:', err)
    const msg = err?.errors?.[0]?.detail || err?.message || 'Charge failed'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
