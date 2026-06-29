import { NextRequest, NextResponse } from 'next/server'
import { Client, Environment } from 'square'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { randomUUID } from 'crypto'
import { sendBookingConfirmation, sendNewBookingAlert, formatTimeLabel, formatDateLabel } from '@/lib/email'
import { checkAndAlertFlaggedCustomer, checkBannedAndAlert } from '@/lib/flagged-customer'
import { checkCartAvailability } from '@/lib/equipment-availability'
import { checkSetWindows } from '@/lib/set-availability'
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

// One set line item in a multi-set order (per-set scheduling).
interface SetLine {
  setSlug:   string
  date:      string   // YYYY-MM-DD
  startHour: number
  endHour:   number
}

interface BookingRequest {
  sourceId: string

  type:       'set' | 'studio'
  // Legacy single-set / studio fields (still supported):
  setSlug:    string | null
  date:       string
  startHour:  number
  endHour:    number
  // New: multiple set line items, each with its own date/time.
  sets?:      SetLine[]

  equipment: { equipment_id: string; quantity: number }[]

  name:  string
  email: string
  phone: string
  notes: string

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

async function getSetId(slug: string): Promise<string | null> {
  const name = SLUG_TO_NAME[slug]
  if (!name) return null
  const { data } = await supabase.from('sets').select('id').eq('name', name).single()
  return data?.id ?? null
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

const SET_PRICES: Record<string, number> = {
  'set-a': 40, 'set-b': 40, 'set-c': 40, 'set-d': 40,
  'concrete': 40, 'vintage': 40, 'cottage': 40,
  'watering-hole': 75, 'the-tank': 75, 'studio-one': 65,
}

const SET_MIN_HOURS: Record<string, number> = {
  'watering-hole': 2, 'the-tank': 2,
}

// Hourly rate for a single set, applying any customer pricing overrides.
function setRateFor(slug: string, pricingOverrides?: any): number {
  let rate = SET_PRICES[slug] ?? 0
  if (pricingOverrides) {
    const perSet = pricingOverrides.sets?.[slug]
    const global = pricingOverrides.hourly_rate
    if (perSet != null) rate = Number(perSet)
    else if (global != null) rate = Number(global)
  }
  return rate
}

function equipmentDollars(
  equipment: { equipment_id: string; quantity: number }[],
  equipRates: Record<string, number>,
  pricingOverrides?: any
): number {
  let total = (equipment ?? []).reduce(
    (sum, l) => sum + (equipRates[l.equipment_id] ?? 0) * (l.quantity ?? 1), 0)
  if (pricingOverrides?.equipment_discount_percent) {
    total = Math.round(total * (1 - Number(pricingOverrides.equipment_discount_percent) / 100))
  }
  return total
}

// ─── Time helpers ─────────────────────────────────────────────────────────────

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
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`
  return `+${digits}`
}

// ─── Normalized order line ──────────────────────────────────────────────────

interface OrderLine {
  type:      'set' | 'studio'
  setSlug:   string | null
  setId:     string | null
  setName:   string
  date:      string
  startHour: number
  endHour:   number
  startISO:  string
  endISO:    string
  spaceDollars:    number   // with customer pricing overrides applied
  stdSpaceDollars: number   // standard (no-override) price, for tamper check
}

async function sendConfirmationSMS(
  body: BookingRequest, lines: OrderLine[], totalCents: number
) {
  const dollars = (totalCents / 100).toFixed(2)
  const sched = lines.map(l =>
    `📍 ${l.setName} — ${l.date} ${fmt12(l.startHour)}–${fmt12(l.endHour)}`).join('\n')

  const message = [
    `✅ Made Kulture — Booking Confirmed!`,
    ``,
    `${body.name}, you're locked in.`,
    sched,
    `💳 $${dollars} charged`,
    ``,
    `4825 Gulf Freeway, Houston TX 77023`,
    `Questions? Reply to this message.`,
  ].join('\n')

  await twilioClient.messages.create({
    body: message, from: process.env.TWILIO_PHONE_NUMBER, to: normalizePhone(body.phone),
  })

  const ownerSummary = lines.map(l => `${l.setName} ${l.date} ${fmt12(l.startHour)}–${fmt12(l.endHour)}`).join(' | ')
  await twilioClient.messages.create({
    body: `🆕 New booking: ${body.name} | ${ownerSummary} | $${dollars}`,
    from: process.env.TWILIO_PHONE_NUMBER, to: '+18324081631',
  })
}

// ─── POST /api/bookings ───────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body: BookingRequest = await req.json()

    // ── 1. Customer pricing overrides ──────────────────────────────────────
    let customerPricingOverrides: any = null
    if (body.email) {
      const { data: custPricing } = await supabase
        .from('customers')
        .select('pricing_overrides')
        .eq('email', body.email.toLowerCase().trim())
        .maybeSingle()
      customerPricingOverrides = custPricing?.pricing_overrides ?? null
    }

    // ── 2. Admin-editable full-warehouse buyout rate ───────────────────────
    const { data: buyoutSetting } = await supabase
      .from('studio_settings').select('value').eq('key', 'buyout_rate').maybeSingle()
    const buyoutRate = Number(buyoutSetting?.value) || 400

    // ── 3. Normalize the requested set line items ──────────────────────────
    //     Studio = one line; otherwise use sets[] if present, else the legacy
    //     single-set fields.
    const rawLines: SetLine[] =
      body.type === 'studio'
        ? [] // handled separately below
        : (Array.isArray(body.sets) && body.sets.length
            ? body.sets
            : (body.setSlug ? [{ setSlug: body.setSlug, date: body.date, startHour: body.startHour, endHour: body.endHour }] : []))

    if (body.type !== 'studio' && rawLines.length === 0) {
      return NextResponse.json({ error: 'No sets selected.' }, { status: 400 })
    }

    // Build normalized order lines (resolve set ids, names, ISO times, price)
    const lines: OrderLine[] = []
    if (body.type === 'studio') {
      lines.push({
        type: 'studio', setSlug: null, setId: null, setName: 'Full Studio Takeover',
        date: body.date, startHour: body.startHour, endHour: body.endHour,
        startISO: hoursToISO(body.date, body.startHour), endISO: hoursToISO(body.date, body.endHour),
        spaceDollars: buyoutRate * (body.endHour - body.startHour),
        stdSpaceDollars: buyoutRate * (body.endHour - body.startHour),
      })
    } else {
      for (const l of rawLines) {
        const setId = await getSetId(l.setSlug)
        if (!setId) return NextResponse.json({ error: `Set not found: ${l.setSlug}` }, { status: 404 })
        const setName = SLUG_TO_NAME[l.setSlug] ?? l.setSlug
        const rate = setRateFor(l.setSlug, customerPricingOverrides)
        const rateStd = setRateFor(l.setSlug)
        lines.push({
          type: 'set', setSlug: l.setSlug, setId, setName,
          date: l.date, startHour: l.startHour, endHour: l.endHour,
          startISO: hoursToISO(l.date, l.startHour), endISO: hoursToISO(l.date, l.endHour),
          spaceDollars: rate * (l.endHour - l.startHour),
          stdSpaceDollars: rateStd * (l.endHour - l.startHour),
        })
      }
    }

    // ── 4. Minimum-hours guard (per line) ──────────────────────────────────
    for (const l of lines) {
      const minH = l.type === 'studio' ? 4 : (SET_MIN_HOURS[l.setSlug ?? ''] ?? 1)
      if ((l.endHour - l.startHour) < minH) {
        return NextResponse.json(
          { error: `${l.setName} requires a minimum ${minH}-hour booking.` },
          { status: 400 }
        )
      }
    }

    // ── 5. Equipment: DB rates + per-window inventory guard ─────────────────
    const equipIds = (body.equipment ?? []).map(l => l.equipment_id)
    const requested: Record<string, number> = {}
    for (const l of body.equipment ?? []) {
      requested[l.equipment_id] = (requested[l.equipment_id] ?? 0) + (l.quantity ?? 1)
    }
    const equipRates: Record<string, number> = {}
    if (equipIds.length) {
      const { data: equipRows } = await supabase.from('equipment').select('id, rate').in('id', equipIds)
      for (const e of equipRows ?? []) equipRates[e.id] = Number(e.rate)

      // Gear must be free during every booked window in the order.
      for (const l of lines) {
        const avail = await checkCartAvailability(supabase, l.startISO, l.endISO, requested)
        if (!avail.ok) {
          const msg = avail.conflicts.map(c => `${c.name} (requested ${c.requested}, ${c.available} free)`).join('; ')
          return NextResponse.json(
            { error: `Some equipment isn't available for ${l.setName} on ${l.date}: ${msg}.` },
            { status: 409 }
          )
        }
      }
    }

    // ── 6. Set availability pre-check (before charging) ─────────────────────
    if (body.type !== 'studio') {
      const windows = lines.map(l => ({ setId: l.setId!, setName: l.setName, startISO: l.startISO, endISO: l.endISO }))
      const { ok, conflicts } = await checkSetWindows(supabase, windows)
      if (!ok) {
        return NextResponse.json({ error: conflicts.map(c => c.reason).join(' ') }, { status: 409 })
      }
    }

    // ── 7. Verify price server-side (prevent tampering) ────────────────────
    const equipCustom = equipmentDollars(body.equipment, equipRates, customerPricingOverrides)
    const equipStd    = equipmentDollars(body.equipment, equipRates)
    const spaceCustom = lines.reduce((s, l) => s + l.spaceDollars, 0)
    const spaceStd    = lines.reduce((s, l) => s + l.stdSpaceDollars, 0)
    const customCents   = Math.round((spaceCustom + equipCustom) * 100)
    const standardCents = Math.round((spaceStd + equipStd) * 100)
    const verifiedCents = customCents

    if (body.totalCents !== standardCents && body.totalCents !== customCents) {
      return NextResponse.json(
        { error: `Price mismatch. Expected $${verifiedCents / 100}, received $${body.totalCents / 100}.` },
        { status: 400 }
      )
    }

    // ── 8. Ban check (once, summarizing the first line) ────────────────────
    const primary = lines[0]
    if (body.email) {
      const { banned } = await checkBannedAndAlert(supabase, body.email, {
        customerEmail: body.email,
        setName:   lines.map(l => l.setName).join(', '),
        date:      formatDateLabel(primary.date),
        startTime: formatTimeLabel(primary.startHour),
        endTime:   formatTimeLabel(primary.endHour),
      })
      if (banned) {
        const { data: setting } = await supabase
          .from('studio_settings').select('value').eq('key', 'ban_message').maybeSingle()
        const banMessage = setting?.value
          ?? 'We were unable to process your booking. Please contact the studio directly at (832) 408-1631.'
        return NextResponse.json({ error: banMessage }, { status: 403 })
      }
    }

    // ── 9. Square: customer + card + ONE payment for the whole order ────────
    const { result: searchResult } = await square.customersApi.searchCustomers({
      query: { filter: { emailAddress: { exact: body.email } } },
    })
    let customerId: string
    if (searchResult.customers && searchResult.customers.length > 0) {
      customerId = searchResult.customers[0].id!
    } else {
      const nameParts = body.name.trim().split(' ')
      const { result: createResult } = await square.customersApi.createCustomer({
        givenName: nameParts[0], familyName: nameParts.slice(1).join(' ') || '',
        emailAddress: body.email, phoneNumber: body.phone, idempotencyKey: randomUUID(),
      })
      customerId = createResult.customer!.id!
    }

    const { result: cardResult } = await square.cardsApi.createCard({
      idempotencyKey: randomUUID(),
      sourceId: body.sourceId,
      card: { customerId, referenceId: `made-kulture-${primary.date}` },
    })
    const savedCardId = cardResult.card!.id!

    const payNote = lines.length > 1
      ? `Made Kulture — ${lines.length} sets — ${body.name}`
      : `Made Kulture — ${primary.setName} — ${primary.date} ${fmt12(primary.startHour)}–${fmt12(primary.endHour)}`

    const { result: paymentResult } = await square.paymentsApi.createPayment({
      sourceId: savedCardId, idempotencyKey: randomUUID(),
      amountMoney: { amount: BigInt(verifiedCents), currency: 'USD' },
      customerId, locationId: process.env.SQUARE_LOCATION_ID!,
      note: payNote, buyerEmailAddress: body.email,
    })
    const squarePaymentId = paymentResult.payment!.id!

    // ── 10. Upsert customer + link auth user ───────────────────────────────
    const { data: customerData } = await supabase
      .from('customers')
      .upsert({ email: body.email, name: body.name, phone: body.phone }, { onConflict: 'email' })
      .select('id').single()
    const supabaseCustomerId = customerData?.id

    const { data: authUsers } = await supabase.auth.admin.listUsers()
    const authUser = authUsers?.users?.find(u => u.email === body.email)
    const authUserId = authUser?.id ?? null
    if (authUserId) {
      await supabase.from('customer_profiles')
        .update({ square_customer_id: customerId })
        .eq('id', authUserId).is('square_customer_id', null)
    }

    // ── 11. Insert one booking row per line (shared order_group) ────────────
    const orderGroup = lines.length > 1 ? randomUUID() : null
    const equipDollars = equipCustom
    const bookingIds: string[] = []

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i]
      const rowTotal = l.spaceDollars + (i === 0 ? equipDollars : 0)
      const { data: bookingData, error: bookingError } = await supabase
        .from('bookings')
        .insert({
          set_id:             l.setId,
          customer_id:        supabaseCustomerId,
          auth_user_id:       authUserId,
          start_time:         l.startISO,
          end_time:           l.endISO,
          status:             'confirmed',
          base_amount:        l.spaceDollars,
          extras_amount:      i === 0 ? equipDollars : 0,
          total_amount:       rowTotal,
          square_payment_id:  squarePaymentId,
          square_customer_id: customerId,
          square_card_id:     savedCardId,
          order_group:        orderGroup,
          source:             'website',
          notes:              body.notes,
        })
        .select('id').single()

      if (bookingError) {
        console.error('Supabase booking error:', bookingError)
        continue
      }
      if (bookingData?.id) {
        bookingIds.push(bookingData.id)

        // Equipment add-ons attach to the first row (charged once).
        if (i === 0 && (body.equipment?.length ?? 0) > 0) {
          const addons = body.equipment.map(e => ({
            booking_id: bookingData.id, equipment_id: e.equipment_id,
            quantity: e.quantity, rate: equipRates[e.equipment_id] ?? 0, paid: true,
          }))
          const { error: addonErr } = await supabase.from('booking_add_ons').insert(addons)
          if (addonErr) console.error('[bookings] add-on insert error:', addonErr)
        }

        // Acuity block for this line (best-effort).
        try {
          const blockIds = await createAcuityBlocks({
            type: l.type, setSlug: l.setSlug, startISO: l.startISO, endISO: l.endISO,
            customerName: body.name, setName: l.setName,
          })
          if (blockIds.length) {
            await supabase.from('bookings').update({ acuity_block_ids: blockIds }).eq('id', bookingData.id)
          }
        } catch (err) {
          console.error('[bookings] Acuity block sync error:', err)
        }
      }
    }

    const firstBookingId = bookingIds[0]

    // ── 12. Flagged customer alert (non-blocking) ──────────────────────────
    if (supabaseCustomerId) {
      checkAndAlertFlaggedCustomer(supabase, supabaseCustomerId, {
        customerName: body.name, customerEmail: body.email,
        setName: lines.map(l => l.setName).join(', '),
        date: formatDateLabel(primary.date),
        startTime: formatTimeLabel(primary.startHour),
        endTime: formatTimeLabel(primary.endHour),
      }).catch(err => console.error('Flagged customer check error:', err))
    }

    // ── 13. Confirmations (SMS + email), non-blocking ──────────────────────
    sendConfirmationSMS(body, lines, verifiedCents).catch(err =>
      console.error('SMS error (non-fatal):', err))

    if (firstBookingId) {
      const scheduleLines = lines.length > 1
        ? lines.map(l => `${l.setName} — ${formatDateLabel(l.date)}, ${formatTimeLabel(l.startHour)} – ${formatTimeLabel(l.endHour)}`)
        : undefined

      sendBookingConfirmation({
        customerName: body.name, customerEmail: body.email,
        setName: lines.map(l => l.setName).join(', '),
        date: formatDateLabel(primary.date),
        startTime: formatTimeLabel(primary.startHour),
        endTime: formatTimeLabel(primary.endHour),
        totalAmount: verifiedCents / 100, bookingId: firstBookingId,
        notes: body.notes || undefined, scheduleLines,
      }).catch(err => console.error('Email confirmation error (non-fatal):', err))

      sendNewBookingAlert({
        customerName: body.name, customerEmail: body.email, customerPhone: body.phone,
        setName: lines.map(l => l.setName).join(', '),
        date: formatDateLabel(primary.date),
        startTime: formatTimeLabel(primary.startHour),
        endTime: formatTimeLabel(primary.endHour),
        totalAmount: verifiedCents / 100, bookingId: firstBookingId,
        source: 'website', notes: body.notes || undefined, scheduleLines,
      }).catch(err => console.error('Email alert error (non-fatal):', err))
    }

    return NextResponse.json({
      success: true,
      bookingId:   firstBookingId,
      bookingIds,
      orderGroup,
      squarePaymentId,
      savedCardId,
      totalCharged: verifiedCents / 100,
    })

  } catch (err: any) {
    console.error('Booking error:', err)
    if (err?.errors) {
      const msg = err.errors[0]?.detail || 'Payment failed'
      return NextResponse.json({ error: msg }, { status: 402 })
    }
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
