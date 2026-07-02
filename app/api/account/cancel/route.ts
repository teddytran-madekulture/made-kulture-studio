import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { sendCancellationEmail, sendCancellationOwnerAlert, formatTimeLabel, formatDateLabel } from '@/lib/email'
import { deleteAcuityBlocks } from '@/lib/acuity-sync'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { booking_id } = await req.json()

  // Fetch the booking — verify it belongs to this user
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('id, start_time, end_time, status, acuity_appointment_id, acuity_block_ids, auth_user_id, customers(name, email, phone), sets(name)')
    .eq('id', booking_id)
    .single()

  if (fetchError || !booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  // Verify ownership
  const customerEmail = (booking.customers as any)?.email
  if (booking.auth_user_id !== user.id && customerEmail !== user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Enforce 48hr cancellation policy
  const startTime = new Date(booking.start_time)
  const hoursUntil = (startTime.getTime() - Date.now()) / (1000 * 60 * 60)
  if (hoursUntil < 48) {
    return NextResponse.json({ error: 'Cancellations must be made at least 48 hours in advance. No refund will be issued per our cancellation policy.' }, { status: 400 })
  }

  // Cancel in Acuity if we have an appointment ID
  if (booking.acuity_appointment_id) {
    const acuityRes = await fetch(
      `https://acuityscheduling.com/api/v1/appointments/${booking.acuity_appointment_id}/cancel`,
      {
        method: 'PUT',
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${process.env.ACUITY_USER_ID}:${process.env.ACUITY_API_KEY}`).toString('base64'),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ noShow: false }),
      }
    )
    if (!acuityRes.ok) {
      const err = await acuityRes.text()
      console.error('Acuity cancel error:', err)
      // Continue anyway — update our DB
    }
  }

  // Remove any Acuity blocks we created for a website booking (frees the slot on the legacy site)
  const blockIds = Array.isArray((booking as any).acuity_block_ids) ? (booking as any).acuity_block_ids : []
  if (blockIds.length) await deleteAcuityBlocks(blockIds)

  // Update Supabase booking status
  const { error: updateError } = await supabase
    .from('bookings')
    .update({ status: 'cancelled', acuity_block_ids: [] })
    .eq('id', booking_id)

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // Send cancellation email (non-blocking)
  const startTime2 = new Date(booking.start_time)
  const endTime2   = new Date(booking.end_time)
  const setName = (booking.sets as any)?.name ?? 'Studio'
  const dateLabel = formatDateLabel(startTime2.toISOString().slice(0, 10))
  const startLbl = formatTimeLabel(startTime2.getHours())
  const endLbl = formatTimeLabel(endTime2.getHours())
  const customerName = (booking.customers as any)?.name ?? 'there'

  // AWAIT the emails — on Vercel, un-awaited promises get frozen when the
  // function suspends right after responding, which aborts the Resend request
  // ("The request could not be resolved"). Each send still .catch()es so a
  // failure stays non-fatal.
  const notifications: Promise<any>[] = []
  if (customerEmail) {
    notifications.push(sendCancellationEmail({
      customerName, customerEmail, setName,
      date: dateLabel, startTime: startLbl, endTime: endLbl,
      refundAmount: hoursUntil >= 48 ? undefined : 0,
    }).catch(e => console.error('Cancellation email error:', e)))
  }
  // Always alert the owner (not gated by template settings).
  notifications.push(sendCancellationOwnerAlert({
    customerName, customerEmail, customerPhone: (booking.customers as any)?.phone ?? undefined,
    setName, date: dateLabel, startTime: startLbl, endTime: endLbl,
    within48: hoursUntil < 48,
  }).catch(e => console.error('Cancellation owner alert error:', e)))
  await Promise.allSettled(notifications)

  return NextResponse.json({ success: true })
}
