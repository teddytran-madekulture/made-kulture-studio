import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { bookingHourToISO, bookingEndISO } from '@/lib/booking-times'
import { issueDoorCodes } from '@/lib/igloohome'
import { createClient } from '@supabase/supabase-js'
import { sendSMS } from '@/lib/sms'
import { sendBookingConfirmation, sendNewBookingAlert, formatTimeLabel, formatDateLabel } from '@/lib/email'
import { checkAndAlertFlaggedCustomer } from '@/lib/flagged-customer'
import { createAcuityBlocks } from '@/lib/acuity-sync'
import { createCalendarEvent, gcalSyncEnabled } from '@/lib/gcal'
import { STUDIO_ADDRESS } from '@/lib/calendar'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// ─── GET /api/admin/bookings ──────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id, start_time, end_time, status, total_amount, notes, source, created_at,
      square_payment_id, square_card_on_file_id, guest_count, guest_fee_amount, customer_id,
      checked_in_at, checked_out_at, arrived_guest_count, cleaning_status,
      sets ( name ),
      customers ( name, email, phone, status, banned, square_customer_id ),
      booking_add_ons ( quantity, rate, paid, equipment ( name ) )
    `)
    .order('start_time', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: settingRows } = await supabase
    .from('studio_settings').select('key, value')
    .in('key', ['guest_penalty_per_head', 'cleaning_fee_set', 'cleaning_fee_studio'])
  const s: Record<string, string> = {}
  for (const r of settingRows ?? []) s[r.key] = r.value
  const guestPenaltyPerHead = Number(s['guest_penalty_per_head']) || 50
  const cleaningFeeSet      = Number(s['cleaning_fee_set'])    || 100
  const cleaningFeeStudio   = Number(s['cleaning_fee_studio']) || 150

  return NextResponse.json({ bookings: data, guestPenaltyPerHead, cleaningFeeSet, cleaningFeeStudio })
}

// ─── POST /api/admin/bookings — manual booking ────────────────────────────────
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { setSlug, date, startHour, endHour, name, email, phone, notes, totalAmount, sendSms } = body

  const SLUG_TO_NAME: Record<string, string> = {
    'set-a': 'Set A', 'set-b': 'Set B', 'set-c': 'Set C', 'set-d': 'Set D',
    'concrete': 'Concrete', 'vintage': 'Vintage', 'cottage': 'Cottage',
    'watering-hole': 'The Watering Hole', 'studio-one': 'Studio One',
    'studio': 'Full Studio Takeover',
  }

  // Upsert customer
  const { data: customerData } = await supabase
    .from('customers')
    .upsert({ email, name, phone }, { onConflict: 'email' })
    .select('id')
    .single()

  // Get set ID
  let setId: string | null = null
  if (setSlug && setSlug !== 'studio') {
    const setName = SLUG_TO_NAME[setSlug]
    const { data: setData } = await supabase
      .from('sets')
      .select('id')
      .eq('name', setName)
      .single()
    setId = setData?.id ?? null
  }

  // Decimal hours (20.5 = 8:30 PM) and overnight spans both land here — see
  // lib/booking-times. The old inline template broke on either.
  const startISO = bookingHourToISO(date, startHour)
  const endISO   = bookingEndISO(date, startHour, endHour)

  const { data: booking, error } = await supabase
    .from('bookings')
    .insert({
      set_id:       setId,
      customer_id:  customerData?.id,
      start_time:   startISO,
      end_time:     endISO,
      status:       'confirmed',
      total_amount: totalAmount,
      base_amount:  totalAmount,
      source:       'manual',
      notes,
    })
    .select('id')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Door codes. A manual booking used to get NONE — createBookingPin was wired
  // into the public flow, booking-core, add-set and extensions, but never here,
  // so anything booked by hand in the dashboard had a null door_code.
  // Skipped for a window that has already ended, where a code is useless.
  let doorCode: string | null = null
  let doorCodeBack: string | null = null
  if (booking?.id && Date.parse(endISO) > Date.now()) {
    const codes = await issueDoorCodes(supabase, booking.id, {
      startISO, endISO,
      accessName: `MK ${SLUG_TO_NAME[setSlug] ?? 'Studio'} ${name || ''}`.slice(0, 40),
    })
    doorCode = codes.doorCode
    doorCodeBack = codes.doorCodeBack
  }

  // Two-way Acuity sync — block this time on Acuity (best-effort)
  if (booking?.id) {
    try {
      const blockIds = await createAcuityBlocks({
        type:         setSlug === 'studio' ? 'studio' : 'set',
        setSlug:      setSlug === 'studio' ? null : setSlug,
        startISO, endISO,
        customerName: name,
        setName:      SLUG_TO_NAME[setSlug] ?? 'Full Studio',
      })
      if (blockIds.length) {
        await supabase.from('bookings').update({ acuity_block_ids: blockIds }).eq('id', booking.id)
      }
    } catch (e) {
      console.error('[admin/bookings] Acuity block sync error:', e)
    }
  }

  // Google Calendar sync (gated on the admin toggle + GCAL_* env; non-fatal)
  if (booking?.id) {
    try {
      if (await gcalSyncEnabled(supabase)) {
        const eventId = await createCalendarEvent({
          summary: `${SLUG_TO_NAME[setSlug] ?? 'Full Studio Takeover'} — ${name}`,
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
      console.error('[admin/bookings] gcal sync error (non-fatal):', e)
    }
  }

  // Check for flagged customer (non-blocking)
  if (customerData?.id) {
    const setDisplayName = SLUG_TO_NAME[setSlug] ?? 'Full Studio Takeover'
    const dateLabel  = formatDateLabel(date)
    const startLabel = formatTimeLabel(startHour)
    const endLabel   = formatTimeLabel(endHour)
    checkAndAlertFlaggedCustomer(supabase, customerData.id, {
      customerName: name, customerEmail: email, setName: setDisplayName,
      date: dateLabel, startTime: startLabel, endTime: endLabel,
    }).catch(e => console.error('Flagged customer check error:', e))
  }

  // Send confirmation SMS if requested
  if (sendSms && phone) {
    const dateLabel = new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    const startLabel = formatTimeLabel(startHour)
    const endLabel   = formatTimeLabel(endHour)
    const msg = [
      `Hi ${name}! Your Made Kulture booking is confirmed.`,
      ``,
      `📍 4825 Gulf Freeway, Houston TX 77023`,
      `📅 ${dateLabel}`,
      `🕐 ${startLabel} – ${endLabel}`,
      ...(doorCode ? [``, `🔑 Front-door code: ${doorCode}`] : []),
      ...(doorCodeBack ? [`🔑 Back-door code: ${doorCodeBack}`] : []),
      ``,
      `Questions? Text (832) 408-1631`,
    ].join('\n')

    await sendSMS(phone, msg)
  }

  // Send emails (non-blocking)
  if (booking?.id && email) {
    const setDisplayName = SLUG_TO_NAME[setSlug] ?? (setSlug === 'studio' ? 'Full Studio Takeover' : setSlug)
    const dateLabel  = formatDateLabel(date)
    const startLabel = formatTimeLabel(startHour)
    const endLabel   = formatTimeLabel(endHour)

    sendBookingConfirmation({
      customerName:  name,
      customerEmail: email,
      setName:       setDisplayName,
      date:          dateLabel,
      startTime:     startLabel,
      endTime:       endLabel,
      totalAmount:   totalAmount,
      bookingId:     booking.id,
      notes:         notes || undefined,
      doorCode:      doorCode || undefined,
      doorCodeBack:  doorCodeBack || undefined,
      startISO,
      endISO,
    }).catch(e => console.error('Email confirmation error:', e))

    sendNewBookingAlert({
      customerName:  name,
      customerEmail: email,
      customerPhone: phone,
      setName:       setDisplayName,
      date:          dateLabel,
      startTime:     startLabel,
      endTime:       endLabel,
      totalAmount:   totalAmount,
      bookingId:     booking.id,
      source:        'manual',
      notes:         notes || undefined,
    }).catch(e => console.error('Email alert error:', e))
  }

  return NextResponse.json({ success: true, bookingId: booking?.id })
}
