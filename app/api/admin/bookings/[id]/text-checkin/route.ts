// POST /api/admin/bookings/[id]/text-checkin
//
// Text the customer their reminder with the check-in link, on demand (2026-10-02).
// Same wording as the 1pm day-before run (lib/reminder-text). For a reminder the
// run missed, a lost text, or a same-day booking set up by hand.
//
// ⚠️ SENDS ONE TEXT AND NOTHING ELSE. Like resend-confirmation, it never goes
// through finalizeBooking: igloohome PINs cannot be revoked, so minting a second
// one for the same window is never acceptable. The check-in link reads whatever
// code is already on the booking.
import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { sendSMSResult } from '@/lib/sms'
import { reminderText } from '@/lib/reminder-text'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: b, error } = await supabase
    .from('bookings')
    .select('id, status, start_time, end_time, check_in_token, sets ( name ), customers ( name, phone )')
    .eq('id', params.id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!b) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
  if (b.status === 'cancelled') return NextResponse.json({ error: 'This booking is cancelled — no reminder to send.' }, { status: 400 })
  if (Date.parse(b.end_time) <= Date.now()) return NextResponse.json({ error: 'This session is already over.' }, { status: 400 })

  const cust: any = Array.isArray(b.customers) ? b.customers[0] : b.customers
  const set: any = Array.isArray(b.sets) ? b.sets[0] : b.sets
  const phone = cust?.phone as string | undefined
  if (!phone) return NextResponse.json({ error: 'No phone number on this booking.' }, { status: 400 })

  const body = reminderText({ name: cust?.name, setName: set?.name, startISO: b.start_time, endISO: b.end_time, checkInToken: b.check_in_token })
  const r = await sendSMSResult(phone, body, { sentBy: 'admin' })
  if (!r.ok) return NextResponse.json({ error: r.error || 'The text did not go through.' }, { status: 502 })
  return NextResponse.json({ ok: true, to: phone, hasCheckInLink: !!b.check_in_token })
}
