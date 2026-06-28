import { NextRequest, NextResponse } from 'next/server'
import { Client, Environment } from 'square'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { randomUUID } from 'crypto'
import { sendBookingConfirmation, sendNewBookingAlert, formatTimeLabel, formatDateLabel } from '@/lib/email'
import { checkAndAlertFlaggedCustomer, checkBannedAndAlert } from '@/lib/flagged-customer'
import { checkCartAvailability } from '@/lib/equipment-availability'
import { createAcuityBlocks } from '@/lib/acuity-sync'

// ─── Clients ──────────────────────────────────────────────────────────────────

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

// ─── Types ────────────────────────────────────────────────────────────────────

interface BookingRequest {
  // Payment
  sourceId: string          // Square card nonce from Web Payments SDK

  // Session
  type:       'set' | 'studio'
  setSlug:    string | null  // e.g. "set-a", "watering-hole"
  date:       string         // YYYY-MM-DD
  startHour:  number         // 9–21
  endHour:    number         // 10–22

  // Equipment add-ons: DB equipment id + quantity
  equipment: { equipment_id: string; quantity: number }[]

  // Customer
  name:  string
  email: string
  phone: string
  notes: string

  // Totals (calculated client-side, verified server-side)
  totalCents: number
}

// ─── Slug → Set name map ──────────────────────────────────────────────────────

const SLUG_TO_NAME: Record<string, string> = {
  'set-a':         'Set A',
  'set-b':         'Set B',
  'set-c':         'Set C',
  'set-d':         'Set D',
  'concrete':      'Concrete',
  'vintage':       'Vintage',
  'cottage':       'Cottage',
  'watering-hole': 'The Watering Hole',
  'the-tank':      'The Tank',
  'studio-one':    'Studio One',
}

// ─── Set → Supabase UUID lookup ───────────────────────────────────────────────

async function getSetId(slug: string): Promise<string | null> {
  const name = SLUG_TO_NAME[slug]
  if (!name) return null
  const { data } = await supabase
    .from('sets')
    .select('id')
    .eq('name', name)
    .single()
  return data?.id ?? null
}

// ─── Server-side price verification ──────────────────────────────────────────

const SET_PRICES: Record<string, number> = {
  'set-a': 40, 'set-b': 40, 'set-c': 40, 'set-d': 40,
  'concrete': 40, 'vintage': 40, 'cottage': 40,
  'watering-hole': 75, 'the-tank': 75, 'studio-one': 65,
}

// Minimum booking length per set (hours). Defaults to 1 when not listed.
const SET_MIN_HOURS: Record<string, number> = {
  'watering-hole': 2, 'the-tank': 2,
}

const EQUIPMENT_PRICES: Record<string, number> = {
  'eq-1': 70,  'eq-2': 50,  'eq-3': 50,  'eq-4': 50,
  'eq-5': 35,  'eq-6': 25,  'eq-7': 150, 'eq-8': 30,
  'eq-9': 20,  'eq-10': 25, 'eq-11': 60, 'eq-12': 65,
  'eq-13': 150, 'eq-14': 65,
}

function verifyTotal(body: BookingRequest, equipRates: Record<string, number>, pricingOverrides?: any): number {
  const hours = body.endHour - body.startHour

  let setRate = body.type === 'studio' ? 400 : (SET_PRICES[body.setSlug ?? ''] ?? 0)
  if (pricingOverrides) {
    const perSet = body.setSlug ? pricingOverrides.sets?.[body.setSlug] : undefined
    const global = pricingOverrides.hourly_rate
    if (perSet != null)  setRate = Number(perSet)
    else if (global != null) setRate = Number(global)
  }

  const spaceTotal = setRate * hours
  let equipTotal   = (body.equipment ?? []).reduce(
    (sum, l) => sum + (equipRates[l.equipment_id] ?? 0) * (l.quantity ?? 1), 0)
  if (pricingOverrides?.equipment_discount_percent) {
    equipTotal = Math.round(equipTotal * (1 - Number(pricingOverrides.equipment_discount_percent) / 100))
  }

  return (spaceTotal + equipTotal) * 100 // cents
}

// ─── SMS helpers ──────────────────────────────────────────────────────────────

function fmt12(h: number) {
  const hour = Math.floor(h)
  const mins = h % 1 !== 0 ? '30' : '00'
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12  = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:${mins}${ampm}`
}

function hoursToISO(date: string, h: number): string {
  const hour = Math.floor(h)
  const mins = h % 1 !== 0 ? '30' : '00'
  return `${date}T${String(hour).padStart(2, '0')}:${mins}:00-05:00`
}

function normalizePhone(phone: string): string {
  // Strip everything except digits
  const digits = phone.replace(/\D/g, '')
  // Add +1 if it's a 10-digit US number
  if (digits.length === 10) return `+1${digits}`
  // Already has country code
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return `+${digits}`
}

async function sendConfirmationSMS(body: BookingRequest, setName: string, totalCents: number) {
  const hours   = body.endHour - body.startHour
  const dollars = (totalCents / 100).toFixed(2)
  const message = [
    `✅ Made Kulture — Booking Confirmed!`,
    ``,
    `${body.name}, you're locked in.`,
    `📅 ${body.date}`,
    `⏰ ${fmt12(body.startHour)} – ${fmt12(body.endHour)} (${hours}hr)`,
    `📍 ${setName}`,
    `💳 $${dollars} charged`,
    ``,
    `4825 Gulf Freeway, Houston TX 77023`,
    `Questions? Reply to this message.`,
  ].join('\n')

  await twilioClient.messages.create({
    body:  message,
    from:  process.env.TWILIO_PHONE_NUMBER,
    to:    normalizePhone(body.phone),
  })

  // Also notify studio owner
  await twilioClient.messages.create({
    body:  `🆕 New booking: ${body.name} | ${setName} | ${body.date} ${fmt12(body.startHour)}–${fmt12(body.endHour)} | $${dollars}`,
    from:  process.env.TWILIO_PHONE_NUMBER,
    to:    '+18324081631', // studio owner number
  })
}

// ─── POST /api/bookings ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body: BookingRequest = await req.json()

    // 0. Enforce minimum booking length (server-side guard)
    //    Full warehouse buyout = 4hr; individual sets per SET_MIN_HOURS (default 1)
    {
      const minH = body.type === 'studio'
        ? 4
        : (body.setSlug ? (SET_MIN_HOURS[body.setSlug] ?? 1) : 1)
      if ((body.endHour - body.startHour) < minH) {
        const label = body.type === 'studio'
          ? 'The full studio buyout'
          : (SLUG_TO_NAME[body.setSlug ?? ''] ?? 'This set')
        return NextResponse.json(
          { error: `${label} requires a minimum ${minH}-hour booking.` },
          { status: 400 }
        )
      }
    }

    // 1. Look up customer pricing overrides (do this before price verification)
    let customerPricingOverrides: any = null
    if (body.email) {
      const { data: custPricing } = await supabase
        .from('customers')
        .select('pricing_overrides')
        .eq('email', body.email.toLowerCase().trim())
        .maybeSingle()
      customerPricingOverrides = custPricing?.pricing_overrides ?? null
    }

    // 2. Equipment: gather requested quantities + authoritative DB rates
    const equipIds = (body.equipment ?? []).map(l => l.equipment_id)
    const requested: Record<string, number> = {}
    for (const l of body.equipment ?? []) {
      requested[l.equipment_id] = (requested[l.equipment_id] ?? 0) + (l.quantity ?? 1)
    }
    const equipRates: Record<string, number> = {}
    if (equipIds.length) {
      const { data: equipRows } = await supabase.from('equipment').select('id, rate').in('id', equipIds)
      for (const e of equipRows ?? []) equipRates[e.id] = Number(e.rate)
    }

    // 2a. Inventory guard — confirm the gear is free for this window
    if (equipIds.length) {
      const winStart = hoursToISO(body.date, body.startHour)
      const winEnd   = hoursToISO(body.date, body.endHour)
      const avail = await checkCartAvailability(supabase, winStart, winEnd, requested)
      if (!avail.ok) {
        const msg = avail.conflicts.map(c => `${c.name} (requested ${c.requested}, ${c.available} free)`).join('; ')
        return NextResponse.json(
          { error: `Some equipment isn't available for that time: ${msg}. Please adjust your kit.` },
          { status: 409 }
        )
      }
    }

    // 2b. Verify price server-side (prevent tampering)
    const standardCents = verifyTotal(body, equipRates)
    const customCents   = customerPricingOverrides ? verifyTotal(body, equipRates, customerPricingOverrides) : standardCents
    const verifiedCents = customCents // charge the customer-specific rate

    if (body.totalCents !== standardCents && body.totalCents !== customCents) {
      return NextResponse.json(
        { error: `Price mismatch. Expected $${verifiedCents / 100}, received $${body.totalCents / 100}.` },
        { status: 400 }
      )
    }

    // 3. Get set name (needed for ban alert message)
    let setId: string | null = null
    let setName = 'Full Studio Takeover'
    if (body.type === 'set' && body.setSlug) {
      setId = await getSetId(body.setSlug)
      if (!setId) return NextResponse.json({ error: 'Set not found' }, { status: 404 })
      setName = SLUG_TO_NAME[body.setSlug] ?? body.setSlug.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    }

    // 4. Ban check — reject before touching Square if customer is banned
    if (body.email) {
      const dateLabel  = formatDateLabel(body.date)
      const startLabel = formatTimeLabel(body.startHour)
      const endLabel   = formatTimeLabel(body.endHour)
      const { banned } = await checkBannedAndAlert(supabase, body.email, {
        customerEmail: body.email,
        setName,
        date:      dateLabel,
        startTime: startLabel,
        endTime:   endLabel,
      })
      if (banned) {
        const { data: setting } = await supabase
          .from('studio_settings')
          .select('value')
          .eq('key', 'ban_message')
          .maybeSingle()
        const banMessage = setting?.value
          ?? 'We were unable to process your booking. Please contact the studio directly at (832) 408-1631.'
        return NextResponse.json({ error: banMessage }, { status: 403 })
      }
    }

    // 5. Create or find Square customer
    const { result: searchResult } = await square.customersApi.searchCustomers({
      query: { filter: { emailAddress: { exact: body.email } } },
    })
    let customerId: string

    if (searchResult.customers && searchResult.customers.length > 0) {
      customerId = searchResult.customers[0].id!
    } else {
      const nameParts = body.name.trim().split(' ')
      const { result: createResult } = await square.customersApi.createCustomer({
        givenName:   nameParts[0],
        familyName:  nameParts.slice(1).join(' ') || '',
        emailAddress: body.email,
        phoneNumber:  body.phone,
        idempotencyKey: randomUUID(),
      })
      customerId = createResult.customer!.id!
    }

    // 4. Save card on file (using the nonce from Web Payments SDK)
    const { result: cardResult } = await square.cardsApi.createCard({
      idempotencyKey: randomUUID(),
      sourceId: body.sourceId,
      card: {
        customerId,
        referenceId: `made-kulture-${body.date}`,
      },
    })
    const savedCardId = cardResult.card!.id!

    // 5. Charge the saved card (full payment upfront)
    const { result: paymentResult } = await square.paymentsApi.createPayment({
      sourceId:    savedCardId,
      idempotencyKey: randomUUID(),
      amountMoney: {
        amount:   BigInt(verifiedCents),
        currency: 'USD',
      },
      customerId,
      locationId: process.env.SQUARE_LOCATION_ID!,
      note: `Made Kulture — ${setName} — ${body.date} ${fmt12(body.startHour)}–${fmt12(body.endHour)}`,
      buyerEmailAddress: body.email,
    })

    const squarePaymentId = paymentResult.payment!.id!

    // 6. Build start/end timestamps in Houston time (UTC-5 CST / UTC-6 CDT)
    //    Supports decimal hours (e.g. 11.5 = 11:30)
    const startISO = hoursToISO(body.date, body.startHour)
    const endISO   = hoursToISO(body.date, body.endHour)

    // 7. Upsert customer in Supabase
    const { data: customerData } = await supabase
      .from('customers')
      .upsert({ email: body.email, name: body.name, phone: body.phone }, { onConflict: 'email' })
      .select('id')
      .single()
    const supabaseCustomerId = customerData?.id

    // Look up Supabase auth user by email to link booking to their account
    const { data: authUsers } = await supabase.auth.admin.listUsers()
    const authUser = authUsers?.users?.find(u => u.email === body.email)
    const authUserId = authUser?.id ?? null

    // Also update their customer_profile's square_customer_id if they have an account
    if (authUserId) {
      await supabase.from('customer_profiles')
        .update({ square_customer_id: customerId })
        .eq('id', authUserId)
        .is('square_customer_id', null)
    }

    // 8. Insert booking into Supabase
    const { data: bookingData, error: bookingError } = await supabase
      .from('bookings')
      .insert({
        set_id:            setId,
        customer_id:       supabaseCustomerId,
        auth_user_id:      authUserId,
        start_time:        startISO,
        end_time:          endISO,
        status:            'confirmed',
        total_amount:      verifiedCents / 100,
        square_payment_id: squarePaymentId,
        square_customer_id: customerId,
        square_card_id:    savedCardId,    // card on file for overages
        source:            'website',
        notes:             body.notes,
      })
      .select('id')
      .single()

    if (bookingError) {
      console.error('Supabase booking error:', bookingError)
      // Payment already went through — log but don't fail the response
      // TODO: trigger reconciliation alert
    }

    // 9. Insert equipment add-ons (persists which gear + qty is on this booking)
    if (bookingData?.id && (body.equipment?.length ?? 0) > 0) {
      const addons = body.equipment.map(l => ({
        booking_id:   bookingData.id,
        equipment_id: l.equipment_id,
        quantity:     l.quantity,
        rate:         equipRates[l.equipment_id] ?? 0,
        paid:         true, // paid as part of this booking's payment
      }))
      const { error: addonErr } = await supabase.from('booking_add_ons').insert(addons)
      if (addonErr) console.error('[bookings] add-on insert error:', addonErr)
    }

    // 9b. Two-way Acuity sync — block this time on Acuity so the legacy site
    //     can't double-book it. Best-effort; never fail the booking over it.
    if (bookingData?.id) {
      try {
        const blockIds = await createAcuityBlocks({
          type:         body.type,
          setSlug:      body.setSlug,
          startISO,
          endISO,
          customerName: body.name,
          setName,
        })
        if (blockIds.length) {
          await supabase.from('bookings').update({ acuity_block_ids: blockIds }).eq('id', bookingData.id)
        }
      } catch (err) {
        console.error('[bookings] Acuity block sync error:', err)
      }
    }

    // 10. Check for flagged customer + alert owner (non-blocking)
    if (supabaseCustomerId) {
      checkAndAlertFlaggedCustomer(supabase, supabaseCustomerId, {
        customerName:  body.name,
        customerEmail: body.email,
        setName,
        date:      formatDateLabel(body.date),
        startTime: formatTimeLabel(body.startHour),
        endTime:   formatTimeLabel(body.endHour),
      }).catch(err => console.error('Flagged customer check error:', err))
    }

    // 11. Send SMS + email confirmations (non-blocking)
    sendConfirmationSMS(body, setName, verifiedCents).catch(err =>
      console.error('SMS error (non-fatal):', err)
    )

    if (bookingData?.id) {
      const dateLabel  = formatDateLabel(body.date)
      const startLabel = formatTimeLabel(body.startHour)
      const endLabel   = formatTimeLabel(body.endHour)

      sendBookingConfirmation({
        customerName:  body.name,
        customerEmail: body.email,
        setName,
        date:      dateLabel,
        startTime: startLabel,
        endTime:   endLabel,
        totalAmount: verifiedCents / 100,
        bookingId: bookingData.id,
        notes: body.notes || undefined,
      }).catch(err => console.error('Email confirmation error (non-fatal):', err))

      sendNewBookingAlert({
        customerName:  body.name,
        customerEmail: body.email,
        customerPhone: body.phone,
        setName,
        date:      dateLabel,
        startTime: startLabel,
        endTime:   endLabel,
        totalAmount: verifiedCents / 100,
        bookingId: bookingData.id,
        source:    'website',
        notes: body.notes || undefined,
      }).catch(err => console.error('Email alert error (non-fatal):', err))
    }

    return NextResponse.json({
      success: true,
      bookingId:       bookingData?.id,
      squarePaymentId,
      savedCardId,
      totalCharged:    verifiedCents / 100,
    })

  } catch (err: any) {
    console.error('Booking error:', err)

    // Surface Square API errors clearly
    if (err?.errors) {
      const msg = err.errors[0]?.detail || 'Payment failed'
      return NextResponse.json({ error: msg }, { status: 402 })
    }

    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
