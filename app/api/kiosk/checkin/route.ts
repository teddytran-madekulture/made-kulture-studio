// POST /api/kiosk/checkin { phone, key? }
// Walk-up check-in from the in-studio kiosk tablet. The guest is physically
// present, so no geofence — just match their phone to a booking that's active
// now (or starting within 30 min) today, Houston time.
//
// Optional hardening: set KIOSK_KEY in Vercel and the kiosk URL passes it;
// requests without the right key are rejected. Unset = open (fine for launch).

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { toE164 } from '@/lib/sms'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

function keyOk(key: unknown): boolean {
  const required = process.env.KIOSK_KEY
  if (!required) return true
  return typeof key === 'string' && key === required
}

function centralTimeLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso))
}

export async function POST(req: NextRequest) {
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request' }, { status: 400 }) }
  if (!keyOk(body?.key)) return NextResponse.json({ error: 'Unauthorized kiosk' }, { status: 401 })

  const phone = toE164(String(body?.phone ?? ''))
  if (!phone) return NextResponse.json({ error: 'Enter the phone number you booked with.' }, { status: 400 })

  const now = Date.now()
  const windowStart = new Date(now - 14 * 3600 * 1000).toISOString() // generous: catch long sessions
  const windowEnd   = new Date(now + 30 * 60 * 1000).toISOString()   // starting within 30 min

  // Bookings whose window overlaps "now-ish" for a customer with this phone.
  const { data: rows, error } = await supabase
    .from('bookings')
    .select('id, start_time, end_time, checked_in_at, status, sets(name), customers!inner(name, phone)')
    .eq('status', 'confirmed')
    .lte('start_time', windowEnd)
    .gte('end_time', windowStart)
  if (error) return NextResponse.json({ error: 'Something glitched — try again.' }, { status: 500 })

  const digits = (p: string | null | undefined) => (p ?? '').replace(/\D/g, '').slice(-10)
  const target = digits(phone)
  const matches = (rows ?? []).filter((b: any) => {
    const cust = Array.isArray(b.customers) ? b.customers[0] : b.customers
    return cust && digits(cust.phone) === target && Date.parse(b.end_time) > now
  })

  if (!matches.length) {
    return NextResponse.json({
      error: "Couldn't find a booking for that number today. Double-check the number, or text (832) 408-1631.",
    }, { status: 404 })
  }

  // Prefer one already in progress, else the next upcoming.
  matches.sort((a: any, b: any) => Date.parse(a.start_time) - Date.parse(b.start_time))
  const active = matches.find((b: any) => Date.parse(b.start_time) <= now) ?? matches[0]
  const cust: any = Array.isArray(active.customers) ? active.customers[0] : active.customers
  const set: any = Array.isArray(active.sets) ? active.sets[0] : active.sets

  const alreadyIn = !!active.checked_in_at
  if (!alreadyIn) {
    await supabase.from('bookings')
      .update({ checked_in_at: new Date().toISOString() })
      .eq('id', active.id)
  }

  return NextResponse.json({
    success: true,
    alreadyCheckedIn: alreadyIn,
    firstName: (cust?.name ?? 'there').split(' ')[0],
    setName: set?.name ?? 'Full Studio',
    until: centralTimeLabel(active.end_time),
    startsAt: Date.parse(active.start_time) > now ? centralTimeLabel(active.start_time) : null,
  })
}
