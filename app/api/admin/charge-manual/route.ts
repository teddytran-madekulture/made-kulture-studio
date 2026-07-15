import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { Client, Environment } from 'square'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { randomUUID } from 'crypto'

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

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)

function normalizePhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.length === 10) return `+1${d}`
  if (d.length === 11 && d.startsWith('1')) return `+${d}`
  return `+${d}`
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    sourceId,       // Web Payments nonce from the keyed-in card (required)
    amount,         // dollars to charge (required)
    description,    // Square note / SMS context
    bookingId,      // optional — booking to update on success
    newTotal,       // optional — new total_amount to save on that booking
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
          const nameParts = (cust.name ?? customerName ?? '').trim().split(' ')
          const cr = await square.customersApi.createCustomer({
            emailAddress: cust.email ?? email ?? undefined,
            givenName:    nameParts[0] || undefined,
            familyName:   nameParts.slice(1).join(' ') || undefined,
            phoneNumber:  cust.phone ?? phone ?? undefined,
            idempotencyKey: `cust-${cust.id}`.slice(0, 45),
          })
          sqCustId = cr.result.customer?.id ?? null
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

    // Update the linked booking: new total and/or attach the saved card.
    if (bookingId) {
      const upd: Record<string, any> = {}
      if (newTotal !== undefined && newTotal !== null) upd.total_amount = newTotal
      if (savedCardId) upd.square_card_on_file_id = savedCardId
      if (Object.keys(upd).length) {
        await supabase.from('bookings').update(upd).eq('id', bookingId)
      }
    }

    // Confirmation SMS (non-fatal).
    let smsError: string | null = null
    if (sendSms && phone) {
      try {
        await twilioClient.messages.create({
          body: `Made Kulture: Hi ${customerName || 'there'}, we've charged $${Number(amount).toFixed(2)} to your card for your booking. Questions? Text (832) 408-1631.`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to:   normalizePhone(phone),
        })
      } catch (e: any) {
        console.error('[charge-manual] SMS error:', e)
        smsError = e?.message || 'SMS failed to send'
      }
    }

    return NextResponse.json({ success: true, squarePaymentId, cardSaved: !!savedCardId, smsError })
  } catch (err: any) {
    console.error('[charge-manual] error:', err)
    const msg = err?.errors?.[0]?.detail || err?.message || 'Payment failed'
    return NextResponse.json({ error: msg }, { status: 402 })
  }
}
