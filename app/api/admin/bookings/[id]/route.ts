import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { deleteAcuityBlocks } from '@/lib/acuity-sync'
import { deleteCalendarEvent, patchCalendarEvent } from '@/lib/gcal'
import { sendCancellationEmail, sendSimpleEmail, formatDateLabel, formatTimeLabel } from '@/lib/email'
import { refundPayment } from '@/lib/square-refund'
import { notifyDelegatedRefund } from '@/lib/refund-notify'
import { issueCredit } from '@/lib/credits'
import { sendSMS, sendOwnerSMS } from '@/lib/sms'
import { notifyCoverageGap } from '@/lib/coverage'
import { issueDoorCodes } from '@/lib/igloohome'
import { centralDateStr, centralHourDecimal } from '@/lib/booking-times'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Central-time readers now live in lib/booking-times (imported above) so there
// is one copy — these were right, and booking-core's positional version wasn't.


export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const updates: Record<string, any> = {}

  if (body.status       !== undefined) updates.status       = body.status

  // If cancelling, remove any Acuity blocks this website booking created
  // and the mirrored Google Calendar event (non-fatal).
  let cancelPaymentId: string | null = null
  let cancelTotalCents = 0
  let cancelAuthUserId: string | null = null
  let cancelCustomer: { name?: string; email?: string; phone?: string } = {}
  if (body.status === 'cancelled') {
    const { data: existing } = await supabase
      .from('bookings').select('acuity_block_ids, gcal_event_id, square_payment_id, total_amount, auth_user_id, customers(name, email, phone)').eq('id', params.id).single()
    const blockIds = Array.isArray(existing?.acuity_block_ids) ? existing!.acuity_block_ids : []
    if (blockIds.length) {
      await deleteAcuityBlocks(blockIds)
      updates.acuity_block_ids = []
    }
    if (existing?.gcal_event_id) {
      try { await deleteCalendarEvent(existing.gcal_event_id) }
      catch (e) { console.error('[admin cancel] gcal delete error (non-fatal):', e) }
      updates.gcal_event_id = null
    }
    cancelPaymentId = (existing as any)?.square_payment_id ?? null
    cancelTotalCents = Math.round(Number((existing as any)?.total_amount || 0) * 100)
    cancelAuthUserId = (existing as any)?.auth_user_id ?? null
    const c: any = (existing as any)?.customers
    if (c) cancelCustomer = { name: c.name, email: c.email, phone: c.phone }
  }
  if (body.start_time   !== undefined) updates.start_time   = body.start_time
  if (body.end_time     !== undefined) updates.end_time     = body.end_time
  if (body.notes        !== undefined) updates.notes        = body.notes
  if (body.total_amount !== undefined) updates.total_amount = body.total_amount
  // Manual check-in / check-out (admin override). Pass ISO string or null.
  if (body.checked_in_at  !== undefined) updates.checked_in_at  = body.checked_in_at
  if (body.checked_out_at !== undefined) updates.checked_out_at = body.checked_out_at
  // Cleaning review status: null (pending) | 'charged' | 'waived'
  if (body.cleaning_status !== undefined) updates.cleaning_status = body.cleaning_status

  // Resolve set name to set_id
  if (body.setName !== undefined) {
    if (!body.setName || body.setName === 'Full Studio Takeover') {
      updates.set_id = null
    } else {
      const { data: setData } = await supabase
        .from('sets').select('id').eq('name', body.setName).single()
      updates.set_id = setData?.id ?? null
    }
  }

  const { error } = await supabase
    .from('bookings').update(updates).eq('id', params.id)

  if (error) {
    const isConflict = error.code === '23P01'
      || error.message?.includes('no_overlap')
      || error.message?.includes('conflicts')
    return NextResponse.json(
      { error: isConflict ? 'This time slot conflicts with another booking.' : error.message },
      { status: isConflict ? 409 : 500 }
    )
  }

  // Optional refund on cancel (money OUT — only when the admin explicitly opts in).
  // For a delegated "someone else pays" booking, also notifies the payer.
  let refundResult: { ok: boolean; amountCents?: number; error?: string } | null = null
  if (body.status === 'cancelled' && body.refund) {
    if (!cancelPaymentId) {
      refundResult = { ok: false, error: 'No Square payment on file for this booking — refund manually in Square if needed.' }
    } else if (cancelTotalCents < 1) {
      refundResult = { ok: false, error: 'Nothing to refund on this booking.' }
    } else {
      try {
        await refundPayment({ paymentId: cancelPaymentId, amountCents: cancelTotalCents, reason: 'Made Kulture booking cancelled' })
        refundResult = { ok: true, amountCents: cancelTotalCents }
        await notifyDelegatedRefund(params.id, cancelTotalCents)
      } catch (e: any) {
        console.error('[admin cancel] refund failed', e)
        refundResult = { ok: false, error: e?.errors?.[0]?.detail || 'Refund failed — issue it in Square directly.' }
      }
    }
  }

  // Optional: issue account credit instead of refunding (the refund-avoidance path).
  // Only works when the booking is tied to an account (auth_user_id).
  let creditResult: { ok: boolean; amountCents?: number; error?: string } | null = null
  if (body.status === 'cancelled' && body.credit) {
    if (!cancelAuthUserId) {
      creditResult = { ok: false, error: 'This booking has no account, so credit can’t be stored. Ask them to create an account, or refund instead.' }
    } else if (cancelTotalCents < 1) {
      creditResult = { ok: false, error: 'Nothing to credit on this booking.' }
    } else {
      const r = await issueCredit(cancelAuthUserId, cancelTotalCents, {
        kind: 'issued', reason: 'Cancelled booking → studio credit', bookingId: params.id, createdBy: 'admin',
      })
      if (r.ok) {
        creditResult = { ok: true, amountCents: cancelTotalCents }
        const dollars = (cancelTotalCents / 100).toFixed(2)
        const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')
        if (cancelCustomer.phone) {
          await sendSMS(cancelCustomer.phone, `Made Kulture: your booking was cancelled and $${dollars} has been added to your account as studio credit — it never expires and applies automatically at your next booking. ${appUrl}/account`).catch(() => {})
        }
        if (cancelCustomer.email) {
          await sendSimpleEmail({
            to: cancelCustomer.email,
            subject: `$${dollars} studio credit added to your account`,
            heading: 'Studio credit added',
            paragraphs: [
              `Your booking was cancelled and <strong style="color:#fff;">$${dollars}</strong> has been added to your Made Kulture account as studio credit.`,
              `It never expires and applies automatically the next time you book — no code needed.`,
            ],
            ctaText: 'Book your next session', ctaUrl: `${appUrl}/availability`, label: 'credit_issued',
          }).catch(() => {})
        }
      } else {
        creditResult = { ok: false, error: r.error || 'Could not add credit.' }
      }
    }
  }

  // A rescheduled window needs a fresh door code; handed back to the caller so
  // the admin can pass it to the customer.
  let newDoorCode: string | null = null
  let newDoorCodeBack: string | null = null

  // If the time window changed (admin reschedule), move the mirrored Google
  // Calendar event too. Non-fatal.
  if (body.status !== 'cancelled' && (body.start_time !== undefined || body.end_time !== undefined)) {
    const { data: bk } = await supabase
      .from('bookings').select('gcal_event_id, start_time, end_time, customers(name), sets(name)').eq('id', params.id).single()
    try {
      if (bk?.gcal_event_id) {
        await patchCalendarEvent(bk.gcal_event_id, { startISO: bk.start_time, endISO: bk.end_time })
      }
    } catch (e) {
      console.error('[admin reschedule] gcal patch error (non-fatal):', e)
    }

    // The existing algoPIN was minted for the OLD window and dies at the old end
    // time — extend a session and the guest is locked out for the added part.
    // Mint one for the new window. Self-gating: issueDoorCodes returns nulls
    // when the lock feature isn't configured.
    //
    // ⚠️ The code goes to the OWNER, never straight to the customer. A plain
    // SAVE in this modal sends the customer nothing today, so firing a text at
    // them off a calendar tidy-up would be a surprise — and quietly changing
    // their code while telling them nothing is worse still. Teddy gets it by SMS
    // (forwardable) and in the modal, and decides.
    if (bk && Date.parse(bk.end_time) > Date.now()) {
      const cust: any = (bk as any).customers
      const setRow: any = (bk as any).sets
      const codes = await issueDoorCodes(supabase, params.id, {
        startISO: bk.start_time,
        endISO:   bk.end_time,
        accessName: `MK ${cust?.name || 'booking'}`.slice(0, 40),
      })
      newDoorCode = codes.doorCode
      newDoorCodeBack = codes.doorCodeBack

      if (newDoorCode || newDoorCodeBack) {
        const when = `${formatDateLabel(centralDateStr(bk.start_time))} ${formatTimeLabel(centralHourDecimal(bk.start_time))}–${formatTimeLabel(centralHourDecimal(bk.end_time))}`
        await sendOwnerSMS([
          `🔑 New door code — ${cust?.name || 'booking'}, ${setRow?.name || 'Full Studio'}`,
          when,
          ...(newDoorCode ? [`Front: ${newDoorCode}`] : []),
          ...(newDoorCodeBack ? [`Back: ${newDoorCodeBack}`] : []),
          `Their old code dies at the original end time — send this to them.`,
        ].join('\n')).catch(e => console.error('[admin reschedule] owner door-code SMS error:', e))
      }
    }
    // A reschedule can push the session past whoever is covering it — warn on a
    // resulting staffing gap. Non-fatal.
    await notifyCoverageGap(params.id).catch(() => {})
  }

  // Optionally notify the customer that their booking was cancelled (opt-in from
  // the admin dashboard). Non-fatal — the cancellation itself already succeeded.
  if (body.status === 'cancelled' && body.notifyCustomer) {
    try {
      const { data: bk } = await supabase
        .from('bookings')
        .select('start_time, end_time, customers(name, email), sets(name)')
        .eq('id', params.id).single()
      const cust: any = (bk as any)?.customers
      const setRow: any = (bk as any)?.sets
      if (bk && cust?.email) {
        await sendCancellationEmail({
          customerName: cust.name || 'there',
          customerEmail: cust.email,
          setName: setRow?.name || 'Full Studio Takeover',
          date: formatDateLabel(centralDateStr(bk.start_time)),
          startTime: formatTimeLabel(centralHourDecimal(bk.start_time)),
          endTime: formatTimeLabel(centralHourDecimal(bk.end_time)),
        })
      }
    } catch (err) {
      console.error('[admin cancel] cancellation email error (non-fatal):', err)
    }
  }

  return NextResponse.json({ success: true, refund: refundResult, credit: creditResult, doorCode: newDoorCode, doorCodeBack: newDoorCodeBack })
}
