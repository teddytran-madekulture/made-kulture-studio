import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { Client, Environment } from 'square'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { randomUUID } from 'crypto'

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

// POST /api/admin/bookings/[id]/cleaning-fee  { amount, sendSms }
// Discretionary post-booking cleaning charge to the card on file. Records the
// amount, marks the booking's cleaning review as resolved (charged), and (opt) texts.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { amount, sendSms } = await req.json()
    const amt = Math.round((Number(amount) || 0) * 100) / 100
    if (amt <= 0) return NextResponse.json({ error: 'Enter a cleaning fee amount.' }, { status: 400 })

    const { data: booking } = await supabase
      .from('bookings')
      .select(`id, start_time, total_amount, square_card_on_file_id, customer_id, customers ( id, name, email, phone, square_customer_id )`)
      .eq('id', params.id)
      .single()

    if (!booking) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })

    const customer = booking.customers as any
    const cardId = booking.square_card_on_file_id as string | null
    const squareCustomerId = customer?.square_customer_id as string | null
    if (!cardId || !squareCustomerId) {
      return NextResponse.json({ error: 'No card on file for this booking — can’t auto-charge.' }, { status: 400 })
    }

    const { result } = await square.paymentsApi.createPayment({
      sourceId:          cardId,
      idempotencyKey:    randomUUID(),
      amountMoney:       { amount: BigInt(Math.round(amt * 100)), currency: 'USD' },
      customerId:        squareCustomerId,
      locationId:        process.env.SQUARE_LOCATION_ID!,
      note:              'Made Kulture — Cleaning fee',
      buyerEmailAddress: customer?.email || undefined,
    })
    const squarePaymentId = result.payment!.id!

    // Mark cleaning review resolved + reflect the charge on the booking total.
    await supabase.from('bookings').update({
      cleaning_status: 'charged',
      total_amount: (Number(booking.total_amount) || 0) + amt,
    }).eq('id', booking.id)

    if (booking.customer_id) {
      const dateLabel = new Date(booking.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      await supabase.from('customer_notes').insert({
        customer_id: booking.customer_id,
        tag:         'note',
        note:        `Charged $${amt.toFixed(2)} cleaning fee to card on file for the ${dateLabel} booking.`,
      })
    }

    let smsError: string | null = null
    if (sendSms && customer?.phone) {
      try {
        await twilioClient.messages.create({
          body: `Made Kulture: a $${amt.toFixed(2)} cleaning fee was charged to your card on file for your recent booking. Questions? Text (832) 408-1631.`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to:   normalizePhone(customer.phone),
        })
      } catch (e: any) {
        smsError = e?.message || 'SMS failed to send'
      }
    }

    return NextResponse.json({ success: true, amount: amt, squarePaymentId, smsError })
  } catch (err: any) {
    console.error('[cleaning-fee] error:', err)
    const msg = err?.errors?.[0]?.detail || err?.message || 'Cleaning charge failed.'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
