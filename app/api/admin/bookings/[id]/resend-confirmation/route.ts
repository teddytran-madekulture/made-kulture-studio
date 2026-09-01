// POST /api/admin/bookings/[id]/resend-confirmation
//
// Send the booking confirmation email again, to the customer on the booking.
//
// Why this exists: the confirmation now carries the /manage/<token> link, which
// is the only way a GUEST (no account) can see or move their own session. Every
// booking made before migration 101 shipped has a token but its customer never
// received one — and there was no way to get it to them short of writing the URL
// out by hand. This is that way.
//
// ⚠️ SENDS ONE EMAIL AND NOTHING ELSE. It deliberately does NOT go through
// finalizeBooking, which also mints door codes, writes a Google Calendar event
// and alerts the owner. Re-running that on a live booking would issue a SECOND
// algoPIN for the same window — and igloohome PINs cannot be revoked — plus a
// duplicate calendar entry and a "new booking!" text for a session from last
// week. A resend must be boring.
//
// ⚠️ Reads the door codes ALREADY ON THE ROW rather than minting any. If a
// booking was rescheduled, that is the current code, which is what the customer
// needs; if there never was one, the email simply omits it, exactly as it did
// the first time.

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { sendBookingConfirmation, formatDateLabel, formatTimeLabel } from '@/lib/email'
import { centralDateStr, centralHourDecimal } from '@/lib/booking-times'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SELECT = `
  id, start_time, end_time, status, set_id, notes, guest_count, total_amount,
  order_group, check_in_token, manage_token, door_code, door_code_back,
  sets ( name ),
  customers ( name, email )
`

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: booking, error: fetchErr } = await supabase
    .from('bookings').select(SELECT).eq('id', params.id).maybeSingle()
  // ⚠️ supabase-js does not throw on a Postgres error — without reading `error`
  // a failed lookup would read as "booking not found".
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!booking) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })

  const b: any = booking
  const cust = Array.isArray(b.customers) ? b.customers[0] : b.customers
  const custEmail = cust?.email as string | undefined
  if (!custEmail) {
    return NextResponse.json({ error: 'This booking has no email address on it — nothing to send to.' }, { status: 400 })
  }
  if (b.status === 'cancelled') {
    return NextResponse.json({ error: 'This booking is cancelled — resending a confirmation for it would tell the customer the opposite.' }, { status: 400 })
  }

  // A multi-set order is ONE confirmation covering every row, so rebuild the
  // whole group. Sending only this row's line would show a customer who booked
  // three sets a confirmation for one, with a third of the price.
  let rows: any[] = [b]
  if (b.order_group) {
    const { data: siblings, error: sibErr } = await supabase
      .from('bookings').select(SELECT)
      .eq('order_group', b.order_group)
      .neq('status', 'cancelled')
      .order('start_time', { ascending: true })
    if (sibErr) return NextResponse.json({ error: sibErr.message }, { status: 500 })
    if (siblings?.length) rows = siblings
  }

  // ⚠️ Central-time readers, never character slicing — Supabase returns
  // timestamptz in UTC, so an 11 PM booking reads as the next day. See
  // dst-central-offset.
  const setNameOf = (r: any) => {
    const s = Array.isArray(r.sets) ? r.sets[0] : r.sets
    return s?.name ?? 'Full Studio Takeover'
  }
  const lines = rows.map((r: any) => ({
    setName:   setNameOf(r),
    date:      centralDateStr(r.start_time),
    startHour: centralHourDecimal(r.start_time),
    endHour:   centralHourDecimal(r.end_time),
    startISO:  r.start_time as string,
    endISO:    r.end_time as string,
  }))
  const primary = lines[0]
  const first: any = rows[0]

  // Capacity wording lives in settings and can change without a deploy; a
  // full-studio buyout has no per-set number to quote.
  const isBuyout = rows.every((r: any) => r.set_id == null)
  let guestCapacity: number | null = null
  if (!isBuyout) {
    const { data: capRow } = await supabase
      .from('studio_settings').select('value').eq('key', 'guest_capacity_per_set').maybeSingle()
    guestCapacity = Number(capRow?.value) || 5
  }

  const totalAmount = rows.reduce((s: number, r: any) => s + Number(r.total_amount ?? 0), 0)
  const scheduleLines = lines.length > 1
    ? lines.map(l => `${l.setName} — ${formatDateLabel(l.date)}, ${formatTimeLabel(l.startHour)} – ${formatTimeLabel(l.endHour)}`)
    : undefined

  // ⚠️ THREE different non-sends, three different fixes — and lib/email.ts
  // signals them differently. It RETURNS NULL when the template is switched off
  // in Settings → Emails or when RESEND_API_KEY is missing, and THROWS when
  // Resend itself rejects (unverified domain, bad address). Collapsing those
  // into one "couldn't send" would leave Teddy toggling settings at a problem
  // that was an env var. And reporting success on a null return would be the
  // kiosk telling a guest someone was on the way.
  let thrown: string | null = null
  const sent = await sendBookingConfirmation({
    customerName: cust?.name ?? 'Guest',
    customerEmail: custEmail,
    setName: lines.map(l => l.setName).join(', '),
    date: formatDateLabel(primary.date),
    startTime: formatTimeLabel(primary.startHour),
    endTime: formatTimeLabel(primary.endHour),
    totalAmount,
    bookingId: first.id,
    notes: first.notes || undefined,
    scheduleLines,
    guestCount: first.guest_count || undefined,
    guestCapacity: guestCapacity ?? undefined,
    doorCode: first.door_code || undefined,
    doorCodeBack: first.door_code_back || undefined,
    startISO: primary.startISO,
    endISO: primary.endISO,
    checkInToken: first.check_in_token || undefined,
    manageToken: first.manage_token || undefined,
  } as any).catch((e: any) => {
    console.error('[resend-confirmation] send failed:', e)
    thrown = e?.message || 'the email provider rejected it'
    return null
  })

  if (!sent) {
    if (thrown) {
      return NextResponse.json({ error: `Not sent — ${thrown}` }, { status: 502 })
    }
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({
        error: 'Not sent — RESEND_API_KEY is not set on this deployment, so no email can go out at all.',
      }, { status: 502 })
    }
    return NextResponse.json({
      error: 'Not sent — the booking confirmation template is switched OFF in Settings → Emails. Turn it on and try again.',
    }, { status: 409 })
  }

  return NextResponse.json({
    success: true,
    to: custEmail,
    // So the dashboard can say whether the link the customer needs is actually
    // in the email it just sent.
    hasManageLink: !!first.manage_token,
  })
}
