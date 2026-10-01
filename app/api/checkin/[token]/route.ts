import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendOwnerSMS } from '@/lib/sms'
import { recordArrival } from '@/lib/arrival'
import { CODE_REVEAL_MINUTES, DOOR_CODE_HOWTO } from '@/lib/igloohome'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Studio location — exact Google-Maps pin for 4825 Gulf Freeway.
const STUDIO_LAT = 29.72444224187077
const STUDIO_LNG = -95.33001395304926
const ONSITE_RADIUS_M = 350   // within this → "on-site ✓" in the owner alert
const FAR_LIMIT_M = 2000      // beyond this → clearly not at the studio, block

// Straight-line distance in metres (haversine).
function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

export const dynamic = 'force-dynamic'

const BOOKING_SELECT = `
  id, start_time, end_time, status, guest_count, arrived_guest_count,
  checked_in_at, checked_out_at, door_code, door_code_back, code_revealed_at,
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

// ── The door code is REVEALED, not sent (2026-10-01) ────────────────────────
// Tapping CHECK IN here stamps code_revealed_at and checks the booking in
// (lib/arrival.ts, via 'phone') — silently: the owner's ONE arrival push comes
// from the door, or the kiosk if the door was never used. The code shows while
// the session is live-ish once revealed OR once the door/tablet checked in.
const REVEAL_BEFORE_MS = CODE_REVEAL_MINUTES * 60 * 1000
const LINGER_AFTER_MS  = 60 * 60 * 1000
function codePayload(b: any, now = Date.now()) {
  const start = new Date(b.start_time).getTime(), end = new Date(b.end_time).getTime()
  const live = now >= start - REVEAL_BEFORE_MS && now <= end + LINGER_AFTER_MS
  const revealed = !!(b.checked_in_at || b.code_revealed_at) && live
  return {
    codeOpensAt: new Date(start - REVEAL_BEFORE_MS).toISOString(),
    doorCode:     revealed ? (b.door_code ?? null) : null,
    doorCodeBack: revealed ? (b.door_code_back ?? null) : null,
    hasDoorCode:  !!(b.door_code || b.door_code_back),
    doorHowTo:    DOOR_CODE_HOWTO,
  }
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
    codeRevealedAt: b.code_revealed_at ?? null,
    checkedOutAt:   b.checked_out_at ?? null,
    ...codePayload(b),
  })
}

// POST /api/checkin/[token] — { action: 'check_in' | 'check_out', guests?: number }
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  try {
    const { action, guests, lat, lng, kiosk } = await req.json()
    const kioskMode = kiosk === true
    const { data: b } = await supabase.from('bookings').select(BOOKING_SELECT).eq('check_in_token', params.token).maybeSingle()
    if (!b) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
    if (b.status === 'cancelled') return NextResponse.json({ error: 'This booking was cancelled.' }, { status: 400 })

    const now = Date.now()
    const start = new Date(b.start_time).getTime()
    const end = new Date(b.end_time).getTime()
    const customer = b.customers as any
    const setName = setNameOf(b)

    if (action === 'check_in') {
      // Window: CODE_REVEAL_MINUTES before start (wide enough to open it in the
      // car — this is now how the guest gets their door code) through 60 min
      // after end.
      if (now < start - REVEAL_BEFORE_MS) {
        return NextResponse.json({ error: `Check-in opens at ${fmtTime(new Date(start - REVEAL_BEFORE_MS).toISOString())}.` }, { status: 400 })
      }
      if (now > end + 60 * 60 * 1000) {
        return NextResponse.json({ error: 'This booking has ended. Text (832) 408-1631 for help.' }, { status: 400 })
      }

      // Location: only block check-ins that are clearly far from the studio
      // (forgiving of GPS wobble / imprecise geocode). Note the confidence in the
      // owner alert so a "not confirmed" ping can be double-checked before greeting.
      let locNote = '❓ location not shared'
      if (typeof lat === 'number' && typeof lng === 'number') {
        const dist = distanceMeters(lat, lng, STUDIO_LAT, STUDIO_LNG)
        if (dist > FAR_LIMIT_M) {
          return NextResponse.json({ error: "You don't look like you're at the studio yet — check in once you arrive." }, { status: 400 })
        }
        locNote = dist <= ONSITE_RADIUS_M ? '✅ on-site' : `📌 ~${Math.round(dist)}m away`
      }

      const arrived = Math.floor(Number(guests) || 0) || null
      // Reveal the code and check in — silently from a phone, with the one
      // arrival push if this is the shared tablet. lib/arrival.ts.
      const revealedAt = b.code_revealed_at ?? new Date().toISOString()
      const { error: upErr } = await supabase.from('bookings').update({
        code_revealed_at: revealedAt,
        ...(arrived ? { arrived_guest_count: arrived } : {}),
      }).eq('id', b.id)
      if (upErr) return NextResponse.json({ error: 'Could not check you in — please try again.' }, { status: 500 })
      await recordArrival(supabase, b as any, kioskMode ? 'kiosk' : 'phone')

      const limit = guestLimitOf(b)
      const over = arrived && arrived > limit
      const guestLine = arrived
        ? `\n👥 party of ${arrived}${over ? ` ⚠️ (limit ${limit})` : ''}`
        : ''
      // AWAITED. Un-awaited, Vercel can freeze the promise the moment this
      // function suspends after responding — the same reason the booking route
      // collects its notifications and allSettles them. A dropped arrival alert
      // means you don't know someone walked in.
      void locNote; void guestLine; void setName; void customer

      // The code comes back in the response — this is the reveal.
      return NextResponse.json({ success: true, checkedIn: true, ...codePayload({ ...b, code_revealed_at: revealedAt }, now) })
    }

    if (action === 'check_out') {
      if (!b.checked_in_at && !b.code_revealed_at) return NextResponse.json({ error: 'Please check in first.' }, { status: 400 })
      await supabase.from('bookings').update({ checked_out_at: new Date().toISOString() }).eq('id', b.id)

      await sendOwnerSMS(`👋 CHECKED OUT — ${customer?.name ?? 'Guest'}\n📍 ${setName} is now free.`)

      return NextResponse.json({ success: true, checkedOut: true })
    }

    return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  } catch (err: any) {
    console.error('[checkin] error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
