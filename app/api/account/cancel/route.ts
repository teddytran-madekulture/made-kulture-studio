import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendCancellationEmail, sendCancellationOwnerAlert, sendSimpleEmail, formatTimeLabel, formatDateLabel } from '@/lib/email'
import { plusActive } from '@/lib/short-notice'
import { issueCredit } from '@/lib/credits'
import { deleteAcuityBlocks } from '@/lib/acuity-sync'
import { deleteCalendarEvent } from '@/lib/gcal'
import { sendSMS } from '@/lib/sms'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { booking_id } = await req.json()

  // Fetch the booking — verify it belongs to this user
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('id, start_time, end_time, status, total_amount, acuity_appointment_id, acuity_block_ids, gcal_event_id, auth_user_id, customers(name, email, phone), sets(name)')
    .eq('id', booking_id)
    .single()

  if (fetchError || !booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  // Verify ownership
  const customerEmail = (booking.customers as any)?.email
  if (booking.auth_user_id !== user.id && customerEmail !== user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Already cancelled? Stop here. Without this, hitting cancel twice ran the
  // whole flow again and issued the Plus credit a SECOND time — free money for
  // anyone who clicked twice. (The real cause of the double-credit report was
  // that the status update below silently did nothing, so the booking never
  // left the list and could be cancelled over and over.)
  if (booking.status === 'cancelled') {
    return NextResponse.json({ error: 'This booking is already cancelled.' }, { status: 409 })
  }

  // Plus members get cancellation protection: they can cancel at any time and the
  // booking's full value returns as studio credit instead of being forfeited.
  const service = createServiceClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
  const { data: custRows } = await service
    .from('customers').select('pricing_overrides').eq('email', (user.email ?? '').toLowerCase()).limit(1)
  const isPlus = plusActive((custRows ?? [])[0]?.pricing_overrides ?? null)

  // Enforce 48hr cancellation policy (Plus members are exempt — they get credit).
  const startTime = new Date(booking.start_time)
  const hoursUntil = (startTime.getTime() - Date.now()) / (1000 * 60 * 60)
  // Once the session has started, self-cancel is off the table for everyone — a
  // Plus member who no-shows goes through the studio's manual approval instead.
  if (hoursUntil <= 0) {
    return NextResponse.json({ error: 'This session has already started — reach out to the studio if you couldn’t make it.' }, { status: 400 })
  }
  if (hoursUntil < 48 && !isPlus) {
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

  // Remove the mirrored Google Calendar event, if one was created. Not gated on
  // the sync toggle — if the event exists it should go, even if sync is now off.
  const gcalEventId = (booking as any).gcal_event_id
  if (gcalEventId) {
    try { await deleteCalendarEvent(gcalEventId) }
    catch (e) { console.error('[account cancel] gcal delete error (non-fatal):', e) }
  }

  // Update the booking status.
  //
  // Two things here are load-bearing:
  //  1. SERVICE client, not the user-scoped one. The user client is subject to
  //     RLS, and a blocked UPDATE returns NO error — it just matches zero rows.
  //     That's why cancelling appeared to succeed while the booking stayed in
  //     the list, and why it could be cancelled (and credited) again and again.
  //  2. `.neq('status','cancelled')` + `.select()` makes this a claim, not a
  //     blind write: exactly one caller can flip it, and we only issue credit if
  //     WE were that caller. Two taps in quick succession can't double-credit.
  const { data: cancelledRows, error: updateError } = await service
    .from('bookings')
    .update({ status: 'cancelled', acuity_block_ids: [], gcal_event_id: null })
    .eq('id', booking_id)
    .neq('status', 'cancelled')
    .select('id')

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 })

  // Zero rows = someone else cancelled it between our read and our write.
  // Do NOT issue credit for a cancellation we didn't perform.
  if (!cancelledRows || cancelledRows.length === 0) {
    return NextResponse.json({ error: 'This booking is already cancelled.' }, { status: 409 })
  }

  // Plus cancellation protection → bank the booking's full value as studio credit.
  let creditCents = 0
  if (isPlus) {
    creditCents = Math.round(Number((booking as any).total_amount || 0) * 100)
    if (creditCents > 0) {
      await issueCredit(user.id, creditCents, {
        kind: 'issued', reason: 'Plus cancellation protection → studio credit', bookingId: booking_id, createdBy: 'system',
      })
    }
  }

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
    if (isPlus && creditCents > 0) {
      const dollars = (creditCents / 100).toFixed(2)
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')
      notifications.push(sendSimpleEmail({
        to: customerEmail,
        subject: `$${dollars} studio credit added — Plus cancellation`,
        heading: 'Studio credit added',
        paragraphs: [
          `Your ${setName} session on ${dateLabel} was cancelled. As a Plus member, its full value — <strong style="color:#fff;">$${dollars}</strong> — is now studio credit on your account.`,
          `It never expires and applies automatically the next time you book.`,
        ],
        ctaText: 'Book your next session', ctaUrl: `${appUrl}/availability`, label: 'plus_cancel_credit',
      }).catch(e => console.error('Plus credit email error:', e)))
    } else {
      notifications.push(sendCancellationEmail({
        customerName, customerEmail, setName,
        date: dateLabel, startTime: startLbl, endTime: endLbl,
        refundAmount: hoursUntil >= 48 ? undefined : 0,
      }).catch(e => console.error('Cancellation email error:', e)))
    }
  }
  // Text them too. Cancellation was email-only, and a booking disappearing with
  // no text is exactly the kind of silence that makes people call to check.
  const customerPhone = (booking.customers as any)?.phone
  if (customerPhone) {
    const smsBody = (isPlus && creditCents > 0)
      ? `Made Kulture: your ${setName} session on ${dateLabel} is cancelled. $${(creditCents / 100).toFixed(2)} has been added to your account as studio credit — it never expires.`
      : `Made Kulture: your ${setName} session on ${dateLabel} at ${startLbl} is cancelled. Questions? Just reply to this text.`
    notifications.push(sendSMS(customerPhone, smsBody).catch(e => console.error('Cancellation SMS error:', e)))
  }

  // Always alert the owner (not gated by template settings).
  notifications.push(sendCancellationOwnerAlert({
    customerName, customerEmail, customerPhone: (booking.customers as any)?.phone ?? undefined,
    setName, date: dateLabel, startTime: startLbl, endTime: endLbl,
    within48: hoursUntil < 48,
  }).catch(e => console.error('Cancellation owner alert error:', e)))
  await Promise.allSettled(notifications)

  return NextResponse.json({ success: true, creditCents })
}
