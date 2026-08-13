import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { findOrphanedByCancel } from '@/lib/plus-instant-book'
import { sendCancellationEmail, sendCancellationOwnerAlert, sendSimpleEmail, formatTimeLabel, formatDateLabel } from '@/lib/email'
import { plusActive } from '@/lib/short-notice'
import { issueCredit } from '@/lib/credits'
import { deleteAcuityBlocks } from '@/lib/acuity-sync'
import { deleteCalendarEvent } from '@/lib/gcal'
import { sendSMS, sendOwnerSMS } from '@/lib/sms'
import { sendOwnerPush } from '@/lib/push'
import { centralDateStr, centralHourDecimal } from '@/lib/booking-times'

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { booking_id } = await req.json()

  // Fetch the booking — verify it belongs to this user
  const { data: booking, error: fetchError } = await supabase
    .from('bookings')
    .select('id, start_time, end_time, status, total_amount, set_id, acuity_appointment_id, acuity_block_ids, gcal_event_id, auth_user_id, customers(name, email, phone), sets(name)')
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
  // A FULL WAREHOUSE booking (set_id null) is its own case. Cancelling one takes
  // the entire building out of availability and there is no way to partially
  // resell a warehouse at short notice — so unlike an individual set, it is
  // never simply forfeited. Inside 48h it carries a late cancellation fee and
  // the rest comes back as credit, the same for Plus and standard alike.
  // Policy decided 2026-08-09 — see Cancellation_Policy_Decision.md.
  const isBuyout = booking.set_id == null

  if (hoursUntil < 48 && !isPlus && !isBuyout) {
    return NextResponse.json({ error: 'Cancellations must be made at least 48 hours in advance to receive studio credit. Text (832) 408-1631 if something has come up.' }, { status: 400 })
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

  // ── What comes back ──────────────────────────────────────────────────────
  //
  // The studio is CREDIT-ONLY — no refunds anywhere in this route, by design.
  //
  //   • Outside 48h, anyone           → 100% credit. Previously a standard
  //     customer who cancelled a week out got NOTHING: the booking cancelled
  //     and no credit was ever issued. That was not policy, it was a gap.
  //   • Inside 48h, individual set    → Plus 100%, standard never reaches here
  //     (blocked by the gate above — that forfeiture is what Plus exists to fix).
  //   • Inside 48h, FULL WAREHOUSE    → 25% late cancellation fee, 75% credit,
  //     regardless of membership.
  const LATE_BUYOUT_FEE_RATE = 0.25
  const totalCents = Math.round(Number((booking as any).total_amount || 0) * 100)
  const lateBuyout = isBuyout && hoursUntil < 48

  let feeCents = 0
  let creditCents = 0
  if (lateBuyout) {
    feeCents = Math.round(totalCents * LATE_BUYOUT_FEE_RATE)
    creditCents = totalCents - feeCents
  } else {
    creditCents = totalCents
  }

  if (creditCents > 0) {
    await issueCredit(user.id, creditCents, {
      kind: 'issued',
      reason: lateBuyout
        ? 'Full warehouse cancelled inside 48h — 25% late cancellation fee applied'
        : (hoursUntil < 48 ? 'Plus cancellation protection → studio credit' : 'Cancelled booking → studio credit'),
      bookingId: booking_id, createdBy: 'system',
    })
  }

  // Send cancellation email (non-blocking)
  const startTime2 = new Date(booking.start_time)
  const endTime2   = new Date(booking.end_time)
  const setName = (booking.sets as any)?.name ?? 'Studio'
  // ⚠️ These used to be toISOString().slice(0,10) and getHours() — i.e. the
  // SERVER's clock, which on Vercel is UTC. An evening booking was emailed with
  // the wrong hour and often the wrong DATE. Same read-side bug fixed in
  // booking-core on 2026-08-09; this copy was missed.
  const dateLabel = formatDateLabel(centralDateStr(booking.start_time as string))
  const startLbl = formatTimeLabel(centralHourDecimal(booking.start_time as string))
  const endLbl = formatTimeLabel(centralHourDecimal(booking.end_time as string))
  const customerName = (booking.customers as any)?.name ?? 'there'

  // AWAIT the emails — on Vercel, un-awaited promises get frozen when the
  // function suspends right after responding, which aborts the Resend request
  // ("The request could not be resolved"). Each send still .catch()es so a
  // failure stays non-fatal.
  const notifications: Promise<any>[] = []
  if (customerEmail) {
    if (creditCents > 0) {
      const dollars = (creditCents / 100).toFixed(2)
      const feeDollars = (feeCents / 100).toFixed(2)
      const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')
      // Say plainly what was kept and why. A silent deduction is the fastest way
      // to turn a cancellation into a dispute.
      const body = lateBuyout
        ? [
            `Your full warehouse booking on ${dateLabel} was cancelled inside 48 hours.`,
            `Because a full warehouse booking takes the entire building out of availability, a 25% late cancellation fee of <strong style="color:#fff;">$${feeDollars}</strong> applies. The remaining <strong style="color:#fff;">$${dollars}</strong> is now studio credit on your account.`,
            `It never expires and applies automatically the next time you book.`,
          ]
        : isPlus && hoursUntil < 48
          ? [
              `Your ${setName} session on ${dateLabel} was cancelled. As a Plus member, its full value — <strong style="color:#fff;">$${dollars}</strong> — is now studio credit on your account.`,
              `It never expires and applies automatically the next time you book.`,
            ]
          : [
              `Your ${setName} session on ${dateLabel} was cancelled.`,
              `Its full value — <strong style="color:#fff;">$${dollars}</strong> — is now studio credit on your account.`,
              `It never expires and applies automatically the next time you book.`,
            ]
      notifications.push(sendSimpleEmail({
        to: customerEmail,
        subject: lateBuyout
          ? `Booking cancelled — $${dollars} studio credit added`
          : `$${dollars} studio credit added — booking cancelled`,
        heading: 'Studio credit added',
        paragraphs: body,
        ctaText: 'Book your next session', ctaUrl: `${appUrl}/availability`, label: 'cancel_credit',
      }).catch(e => console.error('Cancel credit email error:', e)))
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
    const smsBody = lateBuyout
      ? `Made Kulture: your full warehouse booking on ${dateLabel} is cancelled. A 25% late cancellation fee ($${(feeCents / 100).toFixed(2)}) applies inside 48 hours; $${(creditCents / 100).toFixed(2)} has been added as studio credit — it never expires.`
      : creditCents > 0
        ? `Made Kulture: your ${setName} session on ${dateLabel} is cancelled. $${(creditCents / 100).toFixed(2)} has been added to your account as studio credit — it never expires.`
        : `Made Kulture: your ${setName} session on ${dateLabel} at ${startLbl} is cancelled. Questions? Just reply to this text.`
    notifications.push(sendSMS(customerPhone, smsBody).catch(e => console.error('Cancellation SMS error:', e)))
  }

  // ⚠️ Did this cancellation pull the rug out from under a short-notice booking?
  // A Plus member may have booked these hours precisely BECAUSE this session was
  // running. Their booking stands — but the studio now has to be opened for it.
  // Non-fatal and never blocks the cancellation.
  try {
    const orphans = await findOrphanedByCancel(supabase, {
      id: booking.id, start_time: booking.start_time,
      end_time: booking.end_time, set_id: booking.set_id ?? null,
    })
    if (orphans.length) {
      const lines = orphans.map(o => {
        const t = new Intl.DateTimeFormat('en-US', {
          timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric',
          hour: 'numeric', minute: '2-digit',
        }).format(new Date(o.startISO))
        return `${o.name || 'A member'} — ${t}`
      }).join('\n')
      const msg = `⚠️ ${customerName}'s cancellation on ${dateLabel} leaves ${orphans.length === 1 ? 'a short-notice booking' : `${orphans.length} short-notice bookings`} with nothing else in the building:\n${lines}\n\nThe studio was going to be open anyway — now it isn't. Their booking still stands.`
      notifications.push(sendOwnerPush({ title: 'Short-notice booking left stranded', body: msg, url: '/admin/dashboard?view=calendar' }).catch(() => {}))
      notifications.push(sendOwnerSMS(msg).catch(() => {}))
    }
  } catch (e) {
    console.error('[cancel] orphan check failed (non-fatal):', e)
  }

  // Always alert the owner (not gated by template settings).
  notifications.push(sendCancellationOwnerAlert({
    customerName, customerEmail, customerPhone: (booking.customers as any)?.phone ?? undefined,
    setName, date: dateLabel, startTime: startLbl, endTime: endLbl,
    within48: hoursUntil < 48,
  }).catch(e => console.error('Cancellation owner alert error:', e)))
  await Promise.allSettled(notifications)

  return NextResponse.json({ success: true, creditCents, feeCents })
}
