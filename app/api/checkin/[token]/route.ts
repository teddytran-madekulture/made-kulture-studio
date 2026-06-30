import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN)
const OWNER_PHONE = '+18324081631'

export const dynamic = 'force-dynamic'

const BOOKING_SELECT = `
  id, start_time, end_time, status, guest_count, arrived_guest_count,
  checked_in_at, checked_out_at,
  sets ( name, capacity ),
  customers ( name, phone )
`

// Capacity limit for a booking: the set's own capacity, or 30 for a full buyout.
function guestLimitOf(b: any) {
  return (b.sets as any)?.capacity ?? 30
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago' })
}
function setNameOf(b: any) {
  return b.sets?.name ?? 'Full Studio Takeover'
}

// GET /api/checkin/[token] — booking details for the check-in screen.
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const { data: b } = await supabase.from('bookings').select(BOOKING_SELECT).eq('check_in_token', params.token).maybeSingle()
  if (!b) return NextResponse.json({ error: 'not_found' }, { status: 404 })

  return NextResponse.json({
    name:           (b.customers as any)?.name ?? null,
    setName:        setNameOf(b),
    isBuyout:       !(b.sets as any),
    startTime:      b.start_time,
    endTime:        b.end_time,
    status:         b.status,
    declaredGuests: b.guest_count ?? null,
    guestLimit:     guestLimitOf(b),
    arrivedGuests:  b.arrived_guest_count ?? null,
    checkedInAt:    b.checked_in_at ?? null,
    checkedOutAt:   b.checked_out_at ?? null,
  })
}

// POST /api/checkin/[token] — { action: 'check_in' | 'check_out', guests?: number }
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const { action, guests } = await req.json()
    const { data: b } = await supabase.from('bookings').select(BOOKING_SELECT).eq('check_in_token', params.token).maybeSingle()
    if (!b) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    if (b.status === 'cancelled') return NextResponse.json({ error: 'This booking was cancelled.' }, { status: 400 })

    const now = Date.now()
    const start = new Date(b.start_time).getTime()
    const end = new Date(b.end_time).getTime()
    const customer = b.customers as any
    const setName = setNameOf(b)

    if (action === 'check_in') {
      // Window: 60 min before start through 60 min after end.
      if (now < start - 60 * 60 * 1000) {
        return NextResponse.json({ error: `Check-in opens at ${fmtTime(new Date(start - 60 * 60 * 1000).toISOString())}.` }, { status: 400 })
      }
      if (now > end + 60 * 60 * 1000) {
        return NextResponse.json({ error: 'This booking has ended. Text (832) 408-1631 for help.' }, { status: 400 })
      }
      const arrived = Math.floor(Number(guests) || 0) || null
      await supabase.from('bookings').update({
        checked_in_at: new Date().toISOString(),
        ...(arrived ? { arrived_guest_count: arrived } : {}),
      }).eq('id', b.id)

      const limit = guestLimitOf(b)
      const over = arrived && arrived > limit
      const guestLine = arrived
        ? `\n👥 party of ${arrived}${over ? ` ⚠️ (limit ${limit})` : ''}`
        : ''
      twilioClient.messages.create({
        body: `✅ ARRIVED — ${customer?.name ?? 'Guest'}\n📍 ${setName} · ${fmtTime(b.start_time)}–${fmtTime(b.end_time)}${guestLine}`,
        from: process.env.TWILIO_PHONE_NUMBER, to: OWNER_PHONE,
      }).catch(e => console.error('[checkin] owner SMS error:', e))

      return NextResponse.json({ success: true, checkedIn: true })
    }

    if (action === 'check_out') {
      if (!b.checked_in_at) return NextResponse.json({ error: 'Please check in first.' }, { status: 400 })
      await supabase.from('bookings').update({ checked_out_at: new Date().toISOString() }).eq('id', b.id)

      twilioClient.messages.create({
        body: `👋 CHECKED OUT — ${customer?.name ?? 'Guest'}\n📍 ${setName} is now free.`,
        from: process.env.TWILIO_PHONE_NUMBER, to: OWNER_PHONE,
      }).catch(e => console.error('[checkin] owner SMS error:', e))

      return NextResponse.json({ success: true, checkedOut: true })
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  } catch (err: any) {
    console.error('[checkin] error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
