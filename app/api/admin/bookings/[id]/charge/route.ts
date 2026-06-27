import { NextRequest, NextResponse } from 'next/server'
import { Client, Environment } from 'square'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { randomUUID } from 'crypto'

const square = new Client({
  accessToken:  process.env.SQUARE_ACCESS_TOKEN!,
  environment:  process.env.SQUARE_ENVIRONMENT === 'production'
    ? Environment.Production : Environment.Sandbox,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

function isAuthed(req: NextRequest) {
  return req.cookies.get('admin_auth')?.value === process.env.ADMIN_PASSWORD
}

function normalizePhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.length === 10) return `+1${d}`
  if (d.length === 11 && d.startsWith('1')) return `+${d}`
  return `+${d}`
}

// POST /api/admin/bookings/[id]/charge
// Charges a saved Square card for the booking difference and updates the total
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    squareCardId,
    squareCustomerId,
    amount,         // dollars — the difference to charge
    description,
    phone,
    customerName,
    email,
    sendSms,
    newTotal,       // new total_amount to save on the booking
  } = await req.json()

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
  }
  if (!squareCardId || !squareCustomerId) {
    return NextResponse.json({ error: 'Card on file required' }, { status: 400 })
  }

  try {
    const { result } = await square.paymentsApi.createPayment({
      sourceId:          squareCardId,
      idempotencyKey:    randomUUID(),
      amountMoney:       { amount: BigInt(Math.round(amount * 100)), currency: 'USD' },
      customerId:        squareCustomerId,
      locationId:        process.env.SQUARE_LOCATION_ID!,
      note:              description || 'Made Kulture — Booking adjustment',
      buyerEmailAddress: email || undefined,
    })

    const squarePaymentId = result.payment!.id!

    // Update booking total
    if (newTotal !== undefined) {
      await supabase
        .from('bookings')
        .update({ total_amount: newTotal })
        .eq('id', params.id)
    }

    // SMS confirmation
    let smsError: string | null = null
    if (sendSms && phone) {
      try {
        await twilioClient.messages.create({
          body: `Made Kulture: Hi ${customerName}, we've charged $${Number(amount).toFixed(2)} to your card on file for your booking update. Questions? Text (832) 408-1631.`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to:   normalizePhone(phone),
        })
      } catch (e: any) {
        console.error('SMS error:', e)
        smsError = e?.message || 'SMS failed to send'
      }
    }

    return NextResponse.json({ success: true, squarePaymentId, smsError })
  } catch (err: any) {
    console.error('Charge error:', err)
    const msg = err?.errors?.[0]?.detail || err.message || 'Charge failed'
    return NextResponse.json({ error: msg }, { status: 402 })
  }
}
