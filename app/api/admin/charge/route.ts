import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { Client, Environment } from 'square'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { randomUUID } from 'crypto'

const square = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN!,
  environment: process.env.SQUARE_ENVIRONMENT === 'production'
    ? Environment.Production
    : Environment.Sandbox,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)


function fmt12(h: number) {
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12  = h % 12 === 0 ? 12 : h % 12
  return `${h12}:00${ampm}`
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return `+${digits}`
}

const SLUG_TO_NAME: Record<string, string> = {
  'set-a': 'Set A', 'set-b': 'Set B', 'set-c': 'Set C', 'set-d': 'Set D',
  'concrete': 'Concrete', 'vintage': 'Vintage', 'cottage': 'Cottage',
  'watering-hole': 'The Watering Hole', 'studio-one': 'Studio One',
  'studio': 'Full Studio Takeover',
}

// POST /api/admin/charge
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    squareCardId,
    squareCustomerId,
    totalAmount,   // dollars
    setSlug,
    date,
    startHour,
    endHour,
    name,
    email,
    phone,
    notes,
    sendSms,
  } = await req.json()

  const amountCents = Math.round(totalAmount * 100)
  const setName = SLUG_TO_NAME[setSlug] ?? 'Studio'

  try {
    // 1. Charge the card on file
    const { result: paymentResult } = await square.paymentsApi.createPayment({
      sourceId:    squareCardId,
      idempotencyKey: randomUUID(),
      amountMoney: {
        amount:   BigInt(amountCents),
        currency: 'USD',
      },
      customerId: squareCustomerId,
      locationId: process.env.SQUARE_LOCATION_ID!,
      note: `Made Kulture — ${setName} — ${date} ${fmt12(startHour)}–${fmt12(endHour)} [admin]`,
      buyerEmailAddress: email,
    })

    const squarePaymentId = paymentResult.payment!.id!

    // 2. Upsert customer in Supabase
    const { data: customerData } = await supabase
      .from('customers')
      .upsert({ email, name, phone }, { onConflict: 'email' })
      .select('id')
      .single()

    // 3. Get set ID
    let setId: string | null = null
    if (setSlug && setSlug !== 'studio') {
      const { data: setData } = await supabase
        .from('sets').select('id').eq('name', SLUG_TO_NAME[setSlug]).single()
      setId = setData?.id ?? null
    }

    const startISO = `${date}T${String(startHour).padStart(2, '0')}:00:00-05:00`
    const endISO   = `${date}T${String(endHour).padStart(2, '0')}:00:00-05:00`

    // 4. Insert booking
    const { data: booking, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        set_id:             setId,
        customer_id:        customerData?.id,
        start_time:         startISO,
        end_time:           endISO,
        status:             'confirmed',
        total_amount:       totalAmount,
        square_payment_id:  squarePaymentId,
        square_customer_id: squareCustomerId,
        square_card_id:     squareCardId,
        source:             'manual',
        notes,
      })
      .select('id')
      .single()

    if (bookingError) console.error('Supabase error:', bookingError)

    // 5. Send SMS if requested
    if (sendSms && phone) {
      const hours   = endHour - startHour
      const dollars = totalAmount.toFixed(2)
      const msg = [
        `✅ Made Kulture — Booking Confirmed!`,
        ``,
        `${name}, you're locked in.`,
        `📅 ${date}`,
        `⏰ ${fmt12(startHour)} – ${fmt12(endHour)} (${hours}hr)`,
        `📍 ${setName}`,
        `💳 $${dollars} charged`,
        ``,
        `4825 Gulf Freeway, Houston TX 77023`,
        `Questions? Reply to this message.`,
      ].join('\n')

      await twilioClient.messages.create({
        body: msg,
        from: process.env.TWILIO_PHONE_NUMBER,
        to:   normalizePhone(phone),
      }).catch(e => console.error('SMS error:', e))

      await twilioClient.messages.create({
        body: `🆕 Manual booking: ${name} | ${setName} | ${date} ${fmt12(startHour)}–${fmt12(endHour)} | $${dollars}`,
        from: process.env.TWILIO_PHONE_NUMBER,
        to:   '+18324081631',
      }).catch(e => console.error('SMS error:', e))
    }

    return NextResponse.json({ success: true, bookingId: booking?.id, squarePaymentId })

  } catch (err: any) {
    console.error('Charge error:', err)
    const msg = err?.errors?.[0]?.detail || err.message || 'Charge failed'
    return NextResponse.json({ error: msg }, { status: 402 })
  }
}
