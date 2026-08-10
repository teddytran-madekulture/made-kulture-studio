import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { Client, Environment } from 'square'
import { createClient } from '@supabase/supabase-js'
import { sendSMSResult } from '@/lib/sms'
import { sendOwnerPush } from '@/lib/push'
import { randomUUID } from 'crypto'
import { findOrCreateSquareCustomer } from '@/lib/square-customer'

// POST /api/admin/charge-manual
// Charges a card the admin keys in on the spot (Square Web Payments nonce) —
// no saved card required. Optionally saves that card on file to the customer so
// future overages/extensions can auto-charge it. Can be tied to a booking to
// bump its total and attach the saved card.
//
// A Web Payments nonce (cnon:…) is a valid `sourceId` for createPayment exactly
// like a stored card id, so the same charge path serves both keyed-in and
// saved cards. A nonce is single-use: to BOTH save and charge, we createCard
// first (consuming the nonce) and then charge the resulting stored card.

const square = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN!,
  environment: process.env.SQUARE_ENVIRONMENT === 'production'
    ? Environment.Production : Environment.Sandbox,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    sourceId,       // Web Payments nonce from the keyed-in card (required)
    amount,         // dollars to charge (required)
    description,    // Square note / SMS context
    bookingId,      // optional — booking to update on success
    // ⚠️ `newTotal` is deliberately NO LONGER read — see the increment block below.
    customerId,     // optional — supabase customers.id (needed to save a card on file)
    saveCard,       // optional — save this card to the customer for next time
    email,          // buyer email (receipt)
    phone,          // for the confirmation SMS
    customerName,   // for the confirmation SMS
    sendSms,        // send the customer a charge confirmation
  } = await req.json()

  if (!sourceId) return NextResponse.json({ error: 'Card details are required.' }, { status: 400 })
  if (!amount || amount <= 0) return NextResponse.json({ error: 'Amount must be greater than 0.' }, { status: 400 })

  try {
    let chargeSource: string = sourceId
    let chargeCustomerId: string | undefined
    let savedCardId: string | null = null

    // Save the card on file first (single-use nonce → stored card), then charge
    // the stored card. Only possible when we know which customer to attach it to.
    if (saveCard && customerId) {
      const { data: cust } = await supabase
        .from('customers')
        .select('id, name, email, phone, square_customer_id')
        .eq('id', customerId)
        .maybeSingle()

      if (cust) {
        let sqCustId: string | null = cust.square_customer_id ?? null

        if (!sqCustId) {
          // Reuse an existing Square profile for this email — never spawn a duplicate.
          sqCustId = await findOrCreateSquareCustomer(square, {
            email: cust.email ?? email,
            name:  cust.name ?? customerName,
            phone: cust.phone ?? phone,
          })
          if (sqCustId) {
            await supabase.from('customers').update({ square_customer_id: sqCustId }).eq('id', cust.id)
          }
        }

        if (sqCustId) {
          const cardRes = await square.cardsApi.createCard({
            idempotencyKey: randomUUID(),
            sourceId,                       // consumes the nonce
            card: { customerId: sqCustId },
          })
          savedCardId = cardRes.result.card?.id ?? null
          if (savedCardId) {
            chargeSource     = savedCardId  // charge the now-stored card
            chargeCustomerId = sqCustId
            await supabase.from('customers').update({ square_card_id: savedCardId }).eq('id', cust.id)
          }
        }
      }
    }

    // Charge (keyed-in nonce directly, or the stored card we just made).
    const { result } = await square.paymentsApi.createPayment({
      sourceId:       chargeSource,
      idempotencyKey: randomUUID(),
      amountMoney:    { amount: BigInt(Math.round(amount * 100)), currency: 'USD' },
      ...(chargeCustomerId ? { customerId: chargeCustomerId } : {}),
      locationId:     process.env.SQUARE_LOCATION_ID!,
      note:           description || 'Made Kulture — Card payment [admin]',
      buyerEmailAddress: email || undefined,
    })

    const squarePaymentId = result.payment!.id!

    // Update the linked booking: bump the total by what was charged, and/or
    // attach the saved card.
    //
    // ⚠️ INCREMENT, never assign. This used to write an ABSOLUTE `newTotal` sent
    // by the browser, computed there from a hardcoded set-rate map — so charging
    // for extra time wiped equipment add-ons and fees off the recorded price.
    //
    // The money is already gone by this point, so the write is verified with
    // .select() and shouted about on failure: supabase-js does NOT throw on a
    // Postgres error, and an RLS-blocked update returns error:null having matched
    // zero rows, so neither try/catch nor a null `error` proves anything.
    let totalWarning: string | null = null
    if (bookingId) {
      const charged = Math.round(Number(amount) * 100) / 100
      const { data: bk } = await supabase
        .from('bookings').select('total_amount').eq('id', bookingId).maybeSingle()

      const upd: Record<string, any> = {}
      if (bk) upd.total_amount = Math.round(((Number(bk.total_amount) || 0) + charged) * 100) / 100
      if (savedCardId) upd.square_card_on_file_id = savedCardId

      if (Object.keys(upd).length) {
        const { data: upRows, error: upErr } = await supabase
          .from('bookings').update(upd).eq('id', bookingId).select('id')
        if (upErr || !upRows?.length) {
          console.error('[charge-manual] CRITICAL: charged but booking not updated', upErr)
          totalWarning = `Card charged $${charged.toFixed(2)} (${squarePaymentId}) but the booking total did not update — fix it by hand.`
          await sendOwnerPush({
            title: '⚠️ Charged, total not updated',
            body:  `$${charged.toFixed(2)} taken on booking ${bookingId} but total_amount didn't move. Payment ${squarePaymentId}.`,
            url:   '/admin/dashboard',
          }).catch(() => {})
        }
      }
    }

    // Confirmation SMS (non-fatal).
    let smsError: string | null = null
    if (sendSms && phone) {
      const r = await sendSMSResult(phone, `Made Kulture: Hi ${customerName || 'there'}, we've charged $${Number(amount).toFixed(2)} to your card for your booking. Questions? Text (832) 408-1631.`)
      if (!r.ok) smsError = r.error ?? 'SMS failed to send'
    }

    return NextResponse.json({ success: true, squarePaymentId, cardSaved: !!savedCardId, smsError, totalWarning })
  } catch (err: any) {
    console.error('[charge-manual] error:', err)
    const msg = err?.errors?.[0]?.detail || err?.message || 'Payment failed'
    return NextResponse.json({ error: msg }, { status: 402 })
  }
}
