// GET /api/tours/slots?date=YYYY-MM-DD
// 30-minute tour slots for a date. A slot exists only where a confirmed
// single-set booking is already in progress (studio is open) and there is no
// full-studio buyout. Returns Houston-local half-hour start times.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const TOUR_MINUTES = 30
const LEAD_TIME_MS = 2 * 60 * 60 * 1000 // at least 2h notice

export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get('date')
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'date=YYYY-MM-DD required' }, { status: 400 })
  }

  // Generous UTC superset of the Houston day, then precise filtering below.
  const windowStart = new Date(`${date}T00:00:00-07:00`).toISOString()
  const windowEnd   = new Date(`${date}T23:59:59+01:00`).toISOString()

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('start_time, end_time, set_id, status')
    .eq('status', 'confirmed')
    .lt('start_time', windowEnd)
    .gt('end_time', windowStart)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Union of set-booking windows; buyouts (set_id null) subtract everything.
  const sets: Array<[number, number]> = []
  const buyouts: Array<[number, number]> = []
  for (const b of bookings ?? []) {
    const s = Date.parse(b.start_time)
    const e = Date.parse(b.end_time)
    if (b.set_id === null) buyouts.push([s, e])
    else sets.push([s, e])
  }

  const centralDateOf = (ms: number) =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date(ms))
  const centralLabel = (ms: number) =>
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(new Date(ms))

  const now = Date.now()
  const slotMs = TOUR_MINUTES * 60 * 1000
  const slots: { startISO: string; label: string }[] = []

  for (const [s, e] of sets) {
    // Half-hour aligned starts fully inside this booking window.
    let t = Math.ceil(s / (30 * 60 * 1000)) * 30 * 60 * 1000
    for (; t + slotMs <= e; t += 30 * 60 * 1000) {
      if (centralDateOf(t) !== date) continue                        // Houston-local day only
      if (t < now + LEAD_TIME_MS) continue                           // lead time
      if (buyouts.some(([bs, be]) => t < be && t + slotMs > bs)) continue // never during buyouts
      if (slots.some(x => x.startISO === new Date(t).toISOString())) continue
      slots.push({ startISO: new Date(t).toISOString(), label: centralLabel(t) })
    }
  }

  slots.sort((a, b) => a.startISO.localeCompare(b.startISO))
  return NextResponse.json({ date, slots, tourMinutes: TOUR_MINUTES })
}
