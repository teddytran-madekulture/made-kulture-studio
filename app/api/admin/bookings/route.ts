import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { sendBookingConfirmation, sendNewBookingAlert, formatTimeLabel, formatDateLabel } from '@/lib/email'
import { checkAndAlertFlaggedCustomer } from '@/lib/flagged-customer'
import { createAcuityBlocks } from '@/lib/acuity-sync'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const twilioClient = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
)

function normalizePhone(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.length === 10) return `+1${d}`
  if (d.length === 11 && d.startsWith('1')) return `+${d}`
  return `+${d}`
}


// ─── GET /api/admin/bookings ──────────────────────────────────────────────────
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id, start_time, end_time, status, total_amount, notes, source, created_at,
      square_payment_id, square_card_on_file_id, guest_count, guest_fee_amount, customer_id,
      checked_in_at, checked_out_at, arrived_guest_count,
      sets ( name ),
      customers ( name, email, phone, status, banned, square_customer_id ),
      booking_add_ons ( quantity, rate, paid, equipment ( name ) )
    `)
    .order('start_time', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const { data: penaltySetting } = await supabase
    .from('studio_settings').select('value').eq('key', 'guest_penalty_per_head').maybeSingle()
  const guestPenaltyPerHead = Number(penaltySetting?.value) || 50

  return NextResponse.json({ bookings: data, guestPenaltyPerHead })
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

  const startISO = `${date}T${String(startHour).padStart(2, '0')}:00:00-05:00`
  const endISO   = `${date}T${String(endHour).padStart(2, '0')}:00:00-05:00`

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
    const startLabel = startHour >= 12 ? `${startHour === 12 ? 12 : startHour - 12}pm` : `${startHour}am`
    const endLabel   = endHour   >= 12 ? `${endHour   === 12 ? 12 : endHour   - 12}pm` : `${endHour}am`
    const msg = [
      `Hi ${name}! Your Made Kulture booking is confirmed.`,
      ``,
      `📍 4825 Gulf Freeway, Houston TX 77023`,
      `📅 ${dateLabel}`,
      `🕐 ${startLabel} – ${endLabel}`,
      ``,
      `Questions? Text (832) 408-1631`,
    ].join('\n')

    await twilioClient.messages.create({
      body: msg,
      from: process.env.TWILIO_PHONE_NUMBER,
      to:   normalizePhone(phone),
    }).catch(e => console.error('Confirmation SMS error:', e))
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
