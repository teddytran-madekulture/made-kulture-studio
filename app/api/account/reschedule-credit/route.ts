import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { deleteAcuityBlocks } from '@/lib/acuity-sync'
import { deleteCalendarEvent } from '@/lib/gcal'
import { issueCredit } from '@/lib/credits'
import { sendSimpleEmail, formatDateLabel } from '@/lib/email'
import { sendSMS } from '@/lib/sms'
import { sendOwnerPush } from '@/lib/push'

export const dynamic = 'force-dynamic'

// POST /api/account/reschedule-credit  { booking_id }
// "I want to reschedule but don't know when yet" — the customer banks their
// booking's value as non-expiring studio credit and picks a new date later.
// Same ownership + 48-hour policy as a self-serve cancel; the difference is the
// value comes back as account credit instead of a refund.
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const service = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { booking_id } = await req.json()

  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('id, start_time, status, total_amount, acuity_appointment_id, acuity_block_ids, gcal_event_id, auth_user_id, customers(name, email, phone), sets(name)')
    .eq('id', booking_id)
    .single()
  if (fetchError || !booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  // Ownership (verified session user, not a form field).
  const customerEmail = (booking.customers as any)?.email
  if (booking.auth_user_id !== user.id && customerEmail !== user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (booking.status === 'cancelled') {
    return NextResponse.json({ error: 'This booking is already cancelled.' }, { status: 400 })
  }

  // Same 48-hour window as a self-serve cancel. Inside 48h → they text the studio
  // (the team can still credit manually from admin if they choose).
  const hoursUntil = (new Date(booking.start_time).getTime() - Date.now()) / 3_600_000
  if (hoursUntil < 48) {
    return NextResponse.json({ error: 'Within 48 hours of your session, reschedules are handled by the team — text (832) 408-1631 and we’ll sort it out.' }, { status: 400 })
  }

  const creditCents = Math.round(Number(booking.total_amount || 0) * 100)
  if (creditCents < 1) {
    return NextResponse.json({ error: 'This booking has no value to bank as credit.' }, { status: 400 })
  }

  // Free the slot: Acuity appointment + our blocks + mirrored calendar event.
  if (booking.acuity_appointment_id) {
    try {
      await fetch(`https://acuityscheduling.com/api/v1/appointments/${booking.acuity_appointment_id}/cancel`, {
        method: 'PUT',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${process.env.ACUITY_USER_ID}:${process.env.ACUITY_API_KEY}`).toString('base64'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ noShow: false }),
      })
    } catch (e) { console.error('[reschedule-credit] acuity cancel error (non-fatal):', e) }
  }
  const blockIds = Array.isArray((booking as any).acuity_block_ids) ? (booking as any).acuity_block_ids : []
  if (blockIds.length) await deleteAcuityBlocks(blockIds).catch(() => {})
  if ((booking as any).gcal_event_id) {
    try { await deleteCalendarEvent((booking as any).gcal_event_id) }
    catch (e) { console.error('[reschedule-credit] gcal delete error (non-fatal):', e) }
  }

  // Cancel the booking.
  //
  // Identical to the fix in app/api/account/cancel/route.ts, and load-bearing
  // for the same reason:
  //  1. SERVICE client, not the user-scoped one. The user client is subject to
  //     RLS, and a blocked UPDATE returns NO error — it just matches zero rows.
  //     issueCredit() below runs on the service client either way, so the credit
  //     posts regardless. That combination means the booking stays live, the
  //     status guard above keeps passing, and this route can be re-hit for the
  //     booking's full value again and again.
  //  2. `.neq('status','cancelled')` + `.select()` makes this a claim, not a
  //     blind write: exactly one caller flips it, and we only bank credit if WE
  //     were that caller. Two taps in quick succession can't double-credit.
  const { data: cancelledRows, error: updateError } = await service
    .from('bookings')
    .update({ status: 'cancelled', acuity_block_ids: [], gcal_event_id: null })
    .eq('id', booking_id)
    .neq('status', 'cancelled')
    .select('id')
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // Zero rows = someone else cancelled it between our read and our write.
  // Do NOT bank credit for a cancellation we didn't perform.
  if (!cancelledRows || cancelledRows.length === 0) {
    return NextResponse.json({ error: 'This booking is already cancelled.' }, { status: 409 })
  }

  // Bank the value as credit on THIS account.
  const credit = await issueCredit(user.id, creditCents, {
    kind: 'issued', reason: 'Rescheduled — booking value banked as credit', bookingId: booking_id, createdBy: 'customer',
  })
  if (!credit.ok) {
    // The booking is already cancelled; if crediting failed, alert the owner to fix by hand.
    await sendOwnerPush({ title: '⚠️ Reschedule credit failed', body: `${(booking.customers as any)?.name ?? 'A customer'} cancelled to credit but the credit didn't post — add it manually.`, url: '/admin/dashboard' }).catch(() => {})
    return NextResponse.json({ error: 'Your booking was released, but banking the credit hit a snag — the team has been alerted and will add it.' }, { status: 500 })
  }

  // Notify the customer + owner.
  const dollars = (creditCents / 100).toFixed(2)
  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')
  const phone = (booking.customers as any)?.phone
  const name = (booking.customers as any)?.name ?? 'there'
  if (phone) {
    await sendSMS(phone, `Made Kulture: your session is released and $${dollars} is now studio credit on your account — it never expires and applies automatically when you rebook. ${appUrl}/availability`).catch(() => {})
  }
  if (customerEmail) {
    await sendSimpleEmail({
      to: customerEmail,
      subject: `Your $${dollars} studio credit is ready`,
      heading: 'Rescheduled — credit banked',
      paragraphs: [
        `Hi ${name}, your session has been released and <strong style="color:#fff;">$${dollars}</strong> is now studio credit on your Made Kulture account.`,
        `It never expires and applies automatically the next time you book — pick a new date whenever you’re ready.`,
      ],
      ctaText: 'Pick a new date', ctaUrl: `${appUrl}/availability`, label: 'reschedule_credit',
    }).catch(() => {})
  }
  await sendOwnerPush({
    title: '🔄 Booking rescheduled → credit',
    body: `${name} banked $${dollars} as studio credit (self-serve). Slot freed.`,
    url: '/admin/dashboard',
  }).catch(() => {})

  return NextResponse.json({ success: true, creditCents })
}
