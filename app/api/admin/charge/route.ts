import { manualBookingConflict, adminSetNames } from '@/lib/admin-manual-check'
import { NextRequest, NextResponse } from 'next/server'
import { normEmail, upsertCustomerByEmail } from '@/lib/customer-email'
import { authUserIdForEmail, rewardRateForEmail } from '@/lib/rewards'
import { isAdminAuthed } from '@/lib/admin-auth'
import { Client, Environment } from 'square'
import { createClient } from '@supabase/supabase-js'
import { sendSMS, sendOwnerSMS } from '@/lib/sms'
import { randomUUID } from 'crypto'
import { refundPayment } from '@/lib/square-refund'
import { createCalendarEvent, gcalSyncEnabled } from '@/lib/gcal'
import { STUDIO_ADDRESS } from '@/lib/calendar'
import { bookingHourToISO, bookingEndISO, bookingSpanHours } from '@/lib/booking-times'
import { issueDoorCodes, doorCodeLinkLine } from '@/lib/igloohome'

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

// Made Kulture Rewards (migration 109): an admin booking earns like a website
// one when the email belongs to an account. Locks the rate now; the nightly
// payout only pays once a payment is actually recorded on the row.
async function adminRewardFields(email: string, totalAmount: any): Promise<Record<string, any>> {
  try {
    const authId = await authUserIdForEmail(supabase, email)
    if (!authId) return {}
    const rate = await rewardRateForEmail(supabase, email)
    if (rate == null) return {}
    return { reward_rate: rate, reward_basis_cents: Math.max(0, Math.round(Number(totalAmount || 0) * 100)) }
  } catch (e) { console.error('[admin] reward lock failed (non-fatal)', e); return {} }
}

function fmt12(h: number) {
  const hour = Math.floor(h)
  const mins = h % 1 !== 0 ? '30' : '00'
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12  = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:${mins}${ampm}`
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
    force,
    guestSurchargeAmount,
  } = await req.json()
  const gs = Math.max(0, Math.min(Number(guestSurchargeAmount) || 0, Number(totalAmount) || 0))

  // Check the window BEFORE taking any money.
  const clash = await manualBookingConflict(supabase, { setSlug, date, startHour, endHour, force: !!force })
  if (clash) return NextResponse.json(clash.body, { status: clash.status })
  const SLUG_TO_NAME = await adminSetNames(supabase)

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
    const { data: customerData } = await upsertCustomerByEmail(supabase, { email, name, phone }, { trusted: true })

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
        // base_amount was never written here, unlike every other insert site.
        // That left the row's breakdown unreconstructable: total - base - fees
        // is how the rest of the app works out what a booking is made of, and on
        // these rows it silently read as "the whole total is unaccounted for".
        base_amount:            Math.round((Number(totalAmount) - gs) * 100) / 100,
        // 0 unless the form priced a guest at the guest rate (2026-10-14). Explicit, see migration 100.
        guest_surcharge_amount: gs,
        square_payment_id:  squarePaymentId,
        // 2026-10-14: was square_customer_id + square_card_id — NEITHER column
        // exists on bookings, so every insert from this route failed AFTER the
        // card was charged (Christopher Joseph, $40, Oct 14). The card column
        // is square_card_on_file_id, same as every other insert site.
        square_card_on_file_id: squareCardId,
        source:             'manual',
        notes,
        ...(await adminRewardFields(email, totalAmount)),
      })
      .select('id, check_in_token')
      .single()

    // The card is already charged here. A failed insert must NEVER report
    // success (it used to log and return 200, leaving money with no booking):
    // refund the charge and tell the admin exactly what happened.
    if (bookingError || !booking?.id) {
      console.error('[admin/charge] booking insert failed AFTER charge — refunding', squarePaymentId, bookingError)
      let refunded = false
      try { await refundPayment({ paymentId: squarePaymentId, amountCents, reason: 'Booking could not be saved' }); refunded = true }
      catch (e) { console.error('[admin/charge] REFUND FAILED — refund by hand in Square:', squarePaymentId, e) }
      return NextResponse.json({
        error: refunded
          ? `The booking could not be saved, so the $${(amountCents / 100).toFixed(2)} charge was refunded. Nothing was booked. (${bookingError?.message ?? 'no row returned'})`
          : `The card was charged $${(amountCents / 100).toFixed(2)} but the booking could not be saved AND the automatic refund failed. Refund payment ${squarePaymentId} in Square. (${bookingError?.message ?? 'no row returned'})`,
      }, { status: 500 })
    }

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
        ...(doorCode || doorCodeBack ? [``, doorCodeLinkLine((booking as any)?.check_in_token)] : []),
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
