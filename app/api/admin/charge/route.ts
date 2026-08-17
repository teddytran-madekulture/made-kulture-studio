import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { Client, Environment } from 'square'
import { createClient } from '@supabase/supabase-js'
import { sendSMS, sendOwnerSMS } from '@/lib/sms'
import { randomUUID } from 'crypto'
import { createCalendarEvent, gcalSyncEnabled } from '@/lib/gcal'
import { STUDIO_ADDRESS } from '@/lib/calendar'
import { bookingHourToISO, bookingEndISO, bookingSpanHours } from '@/lib/booking-times'
import { issueDoorCodes, DOOR_CODE_HOWTO } from '@/lib/igloohome'

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

function fmt12(h: number) {
  const hour = Math.floor(h)
  const mins = h % 1 !== 0 ? '30' : '00'
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12  = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:${mins}${ampm}`
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

    // Decimal hours (20.5 = 8:30 PM) and overnight spans both land here — see
    // lib/booking-times. The old inline template broke on either.
    const startISO = bookingHourToISO(date, startHour)
    const endISO   = bookingEndISO(date, startHour, endHour)

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

    // 4a. Door codes — same gap as /api/admin/bookings: a manually charged
    //     booking never got one. Skipped for an already-ended window.
    let doorCode: string | null = null
    let doorCodeBack: string | null = null
    if (booking?.id && Date.parse(endISO) > Date.now()) {
      const codes = await issueDoorCodes(supabase, booking.id, {
        startISO, endISO,
        accessName: `MK ${setName} ${name || ''}`.slice(0, 40),
      })
      doorCode = codes.doorCode
      doorCodeBack = codes.doorCodeBack
    }

    // 4b. Google Calendar sync (gated on the admin toggle + GCAL_* env; non-fatal)
    if (booking?.id) {
      try {
        if (await gcalSyncEnabled(supabase)) {
          const eventId = await createCalendarEvent({
            summary: `${setName} — ${name}`,
            description: [
              `Booking ${booking.id}`,
              `${name} · ${email}${phone ? ` · ${phone}` : ''}`,
              ...(notes ? [`Notes: ${notes}`] : []),
            ].join('\n'),
            location: STUDIO_ADDRESS,
            startISO, endISO,
          })
          if (eventId) {
            await supabase.from('bookings').update({ gcal_event_id: eventId }).eq('id', booking.id)
          }
        }
      } catch (e) {
        console.error('[admin/charge] gcal sync error (non-fatal):', e)
      }
    }

    // 5. Send SMS if requested
    if (sendSms && phone) {
      const hours   = bookingSpanHours(startHour, endHour)
      const dollars = totalAmount.toFixed(2)
      const msg = [
        `✅ Made Kulture — Booking Confirmed!`,
        ``,
        `${name}, you're locked in.`,
        `📅 ${date}`,
        `⏰ ${fmt12(startHour)} – ${fmt12(endHour)} (${hours}hr)`,
        `📍 ${setName}`,
        `💳 $${dollars} charged`,
        ...(doorCode ? [`🔑 Front-door code: ${doorCode}`] : []),
        ...(doorCodeBack ? [`🔑 Back-door code: ${doorCodeBack}`] : []),
        ...(doorCode || doorCodeBack ? [DOOR_CODE_HOWTO] : []),
        ``,
        `4825 Gulf Freeway, Houston TX 77023`,
        `Questions? Text (832) 408-1631.`,
      ].join('\n')

      await sendSMS(phone, msg)
      await sendOwnerSMS(`🆕 Manual booking: ${name} | ${setName} | ${date} ${fmt12(startHour)}–${fmt12(endHour)} | $${dollars}`)
    }

    return NextResponse.json({ success: true, bookingId: booking?.id, squarePaymentId })

  } catch (err: any) {
    console.error('Charge error:', err)
    const msg = err?.errors?.[0]?.detail || err.message || 'Charge failed'
    return NextResponse.json({ error: msg }, { status: 402 })
  }
}
