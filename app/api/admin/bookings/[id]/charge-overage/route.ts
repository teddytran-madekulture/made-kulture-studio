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

// POST /api/admin/bookings/[id]/charge-overage
// Charges the card on file guest_penalty_per_head × extraGuests for a customer
// who brought more people than they declared, logs a warning note, and (opt) texts them.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { extraGuests, sendSms } = await req.json()
    const extra = Math.floor(Number(extraGuests) || 0)
    if (extra <= 0) return NextResponse.json({ error: 'Enter how many guests over the limit.' }, { status: 400 })

    // Booking + customer
    const { data: booking } = await supabase
      .from('bookings')
      .select(`
        id, start_time, guest_count, square_card_on_file_id, customer_id,
        customers ( id, name, email, phone, square_customer_id )
      `)
      .eq('id', params.id)
      .single()

    if (!booking) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })

    const customer = booking.customers as any
    const cardId = booking.square_card_on_file_id as string | null
    const squareCustomerId = customer?.square_customer_id as string | null

    if (!cardId || !squareCustomerId) {
      return NextResponse.json({ error: 'No card on file for this booking — can’t auto-charge.' }, { status: 400 })
    }

    // Penalty rate
    const { data: setting } = await supabase
      .from('studio_settings').select('value').eq('key', 'guest_penalty_per_head').maybeSingle()
    const penalty = Number(setting?.value) || 50
    const amount = extra * penalty

    // Charge the card on file
    const note = `Guest overage — ${extra} over the ${booking.guest_count ?? '?'}-person booking`
    const { result } = await square.paymentsApi.createPayment({
      sourceId:          cardId,
      idempotencyKey:    randomUUID(),
      amountMoney:       { amount: BigInt(Math.round(amount * 100)), currency: 'USD' },
      customerId:        squareCustomerId,
      locationId:        process.env.SQUARE_LOCATION_ID!,
      note:              `Made Kulture — ${note}`,
      buyerEmailAddress: customer?.email || undefined,
    })
    const squarePaymentId = result.payment!.id!

    // Log a warning note on the customer (this also flags them on future bookings)
    if (booking.customer_id) {
      const dateLabel = new Date(booking.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      await supabase.from('customer_notes').insert({
        customer_id: booking.customer_id,
        tag:         'warning',
        note:        `Brought ${extra} guest(s) over the declared ${booking.guest_count ?? '?'}-person limit on ${dateLabel}. Charged $${amount.toFixed(2)} overage to card on file.`,
      })
    }

    // Optional SMS to the customer
    let smsError: string | null = null
    if (sendSms && customer?.phone) {
      try {
        await twilioClient.messages.create({
          body: `Made Kulture: $${amount.toFixed(2)} was charged to your card on file for ${extra} guest(s) over your booking's limit. Questions? Text (832) 408-1631.`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to:   normalizePhone(customer.phone),
        })
      } catch (e: any) {
        smsError = e?.message || 'SMS failed to send'
      }
    }

    return NextResponse.json({ success: true, amount, squarePaymentId, smsError })
  } catch (err: any) {
    console.error('[charge-overage] error:', err)
    const msg = err?.errors?.[0]?.detail || err?.message || 'Overage charge failed.'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
