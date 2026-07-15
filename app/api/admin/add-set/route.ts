import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { Client, Environment } from 'square'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { randomUUID } from 'crypto'
import { createCalendarEvent, gcalSyncEnabled } from '@/lib/gcal'
import { createBookingPin } from '@/lib/igloohome'
import { findOrCreateSquareCustomer } from '@/lib/square-customer'
import { STUDIO_ADDRESS } from '@/lib/calendar'

// Add another set to a customer — creates a SECOND, independent booking on a
// DIFFERENT set (any date/time), since a plain extension can only push the end
// time of the one set they're already in. Checks the set is actually free for
// the window, charges the same customer (saved card OR a keyed-in card), then
// creates the booking with door code + calendar + receipt.

const square = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN!,
  environment: process.env.SQUARE_ENVIRONMENT === 'production' ? Environment.Production : Environment.Sandbox,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)

function fmt12(h: number) {
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12  = h % 12 === 0 ? 12 : h % 12
  return `${h12}:00${ampm}`
}
function normalizePhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.length === 10) return `+1${d}`
  if (d.length === 11 && d.startsWith('1')) return `+${d}`
  return `+${d}`
}
function isoFor(date: string, hour: number): string {
  return `${date}T${String(hour).padStart(2, '0')}:00:00-05:00`
}

// Resolve set + rate, and whether it's free for [startISO, endISO). A full-studio
// buyout (set_id null) blocks every set, so it counts as a conflict too.
async function resolveAndCheck(setName: string, date: string, startHour: number, endHour: number) {
  const { data: setRow } = await supabase
    .from('sets').select('id, rate_per_hour').eq('name', setName).maybeSingle()
  if (!setRow) return { error: `Unknown set "${setName}".` as string }

  if (!(endHour > startHour)) return { error: 'End time must be after start time.' }
  const startISO = isoFor(date, startHour)
  const endISO   = isoFor(date, endHour)

  const { data: clash } = await supabase
    .from('bookings')
    .select('id')
    .or(`set_id.eq.${setRow.id},set_id.is.null`)
    .neq('status', 'cancelled')
    .lt('start_time', endISO)
    .gt('end_time', startISO)
    .limit(1)

  const rate  = Number(setRow.rate_per_hour) || 0
  const price = rate * (endHour - startHour)
  return { setId: setRow.id, rate, price, startISO, endISO, available: !(clash && clash.length) }
}

// GET preview: ?setName&date&startHour&endHour → { available, price, rate }
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const p = req.nextUrl.searchParams
  const setName = p.get('setName') || ''
  const date = p.get('date') || ''
  const startHour = Number(p.get('startHour'))
  const endHour = Number(p.get('endHour'))
  if (!setName || !date || !(endHour > startHour)) {
    return NextResponse.json({ error: 'setName, date, startHour, endHour required' }, { status: 400 })
  }
  const r = await resolveAndCheck(setName, date, startHour, endHour)
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ available: r.available, price: r.price, rate: r.rate })
}

// POST execute: check availability → charge → insert booking → door + gcal + sms.
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    setName, date, startHour, endHour,
    customerId,                 // supabase customers.id (same customer)
    name, email, phone,
    squareCardId, squareCustomerId,   // charge a saved card on file
    sourceId, saveCard,               // OR charge a keyed-in card (nonce)
    sendSms,
  } = await req.json()

  if (!setName || !date || !(endHour > startHour)) {
    return NextResponse.json({ error: 'Missing set, date, or times.' }, { status: 400 })
  }
  if (!squareCardId && !sourceId) {
    return NextResponse.json({ error: 'A card is required to book the added set.' }, { status: 400 })
  }

  // 1. Re-check availability at execute time (schedule may have changed).
  const r = await resolveAndCheck(setName, date, startHour, endHour)
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: 400 })
  if (!r.available) {
    return NextResponse.json({ error: `${setName} is already booked for that window.` }, { status: 409 })
  }
  const amount = r.price

  try {
    // 2. Resolve the payment source (charge only AFTER availability passes).
    let chargeSource: string = squareCardId || sourceId
    let chargeCustomerId: string | undefined = squareCardId ? squareCustomerId : undefined
    let savedCardId: string | null = squareCardId || null

    if (!squareCardId && sourceId && saveCard) {
      // Keyed-in card the admin wants saved: attach to a (deduped) Square customer,
      // then charge the stored card.
      const sqCustId = await findOrCreateSquareCustomer(square, { email, name, phone })
      if (sqCustId) {
        const cardRes = await square.cardsApi.createCard({
          idempotencyKey: randomUUID(), sourceId, card: { customerId: sqCustId },
        })
        savedCardId = cardRes.result.card?.id ?? null
        if (savedCardId) {
          chargeSource = savedCardId
          chargeCustomerId = sqCustId
          if (customerId) await supabase.from('customers').update({ square_card_id: savedCardId, square_customer_id: sqCustId }).eq('id', customerId)
        }
      }
    }

    const { result: pay } = await square.paymentsApi.createPayment({
      sourceId:       chargeSource,
      idempotencyKey: randomUUID(),
      amountMoney:    { amount: BigInt(Math.round(amount * 100)), currency: 'USD' },
      ...(chargeCustomerId ? { customerId: chargeCustomerId } : {}),
      locationId:     process.env.SQUARE_LOCATION_ID!,
      note:           `Made Kulture — ${setName} — ${date} ${fmt12(startHour)}–${fmt12(endHour)} [added set]`,
      buyerEmailAddress: email || undefined,
    })
    const squarePaymentId = pay.payment!.id!

    // 3. Insert the new booking.
    const { data: booking, error: insErr } = await supabase
      .from('bookings')
      .insert({
        set_id:                 r.setId,
        customer_id:            customerId || null,
        start_time:             r.startISO,
        end_time:               r.endISO,
        status:                 'confirmed',
        base_amount:            amount,
        total_amount:           amount,
        square_payment_id:      squarePaymentId,
        square_card_on_file_id: savedCardId,
        source:                 'manual',
      })
      .select('id')
      .single()

    if (insErr || !booking) {
      // Charged but couldn't create the booking — surface loudly so it's fixed by hand.
      console.error('[add-set] CRITICAL: charged but insert failed', insErr)
      return NextResponse.json({
        error: 'Payment went through but the booking could not be created — check the schedule; the charge may need a manual refund.',
        charged: true, squarePaymentId,
      }, { status: 500 })
    }

    // Back-charge for a session that already happened → no door code, and a
    // receipt (not a future-framed "confirmed") message.
    const isPast = new Date(r.endISO).getTime() < Date.now()

    // 4. Door code (non-fatal) — only for upcoming windows; useless for a past one.
    let doorCode: string | null = null
    if (!isPast) {
      try {
        const pin = await createBookingPin({
          startISO: r.startISO, endISO: r.endISO,
          accessName: `MK ${setName} ${name || ''}`.slice(0, 40),
        })
        if (pin) {
          doorCode = pin.pin
          await supabase.from('bookings')
            .update({ door_code: pin.pin, door_code_pin_id: pin.pinId }).eq('id', booking.id)
        }
      } catch (e) { console.error('[add-set] door code error (non-fatal):', e) }
    }

    // 5. Calendar sync (non-fatal).
    try {
      if (await gcalSyncEnabled(supabase)) {
        const eventId = await createCalendarEvent({
          summary: `${setName} — ${name || 'Guest'}`,
          description: [`Added-set booking ${booking.id}`, `${name || ''} · ${email || ''}${phone ? ` · ${phone}` : ''}`].join('\n'),
          location: STUDIO_ADDRESS, startISO: r.startISO, endISO: r.endISO,
        })
        if (eventId) await supabase.from('bookings').update({ gcal_event_id: eventId }).eq('id', booking.id)
      }
    } catch (e) { console.error('[add-set] gcal error (non-fatal):', e) }

    // 6. SMS (non-fatal) — a receipt for a past session, a confirmation for an upcoming one.
    if (sendSms && phone) {
      const msg = isPast
        ? `Made Kulture: we've charged $${amount.toFixed(2)} to your card for the extra time in ${setName} on ${date}. Questions? Text (832) 408-1631.`
        : [
            `✅ Made Kulture — added set confirmed!`,
            ``,
            `${name || ''}`.trim(),
            `📅 ${date}`,
            `⏰ ${fmt12(startHour)} – ${fmt12(endHour)}`,
            `📍 ${setName}`,
            `💳 $${amount.toFixed(2)} charged`,
            ...(doorCode ? [`🔑 Door code: ${doorCode}`] : []),
            ``,
            `4825 Gulf Freeway, Houston TX 77023`,
            `Questions? Text (832) 408-1631.`,
          ].join('\n')
      await twilioClient.messages.create({
        body: msg, from: process.env.TWILIO_PHONE_NUMBER, to: normalizePhone(phone),
      }).catch(e => console.error('[add-set] SMS error:', e))
    }

    return NextResponse.json({ success: true, bookingId: booking.id, squarePaymentId, doorCode })
  } catch (err: any) {
    console.error('[add-set] error:', err)
    const msg = err?.errors?.[0]?.detail || err?.message || 'Could not add the set.'
    return NextResponse.json({ error: msg }, { status: 402 })
  }
}
