import { logBookingChange } from '@/lib/booking-changes'
import { reconcileMiniForBooking } from '@/lib/mini-sessions-server'
import { NextRequest, NextResponse } from 'next/server'
import { adjustRewardForRefund } from '@/lib/rewards'
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
import { checkSetWindows, checkBuyoutWindow } from '@/lib/set-availability'
import { issueDoorCodes } from '@/lib/igloohome'
import { centralDateStr, centralHourDecimal } from '@/lib/booking-times'
import { guestAmountsForWindow } from '@/lib/guest-rate'

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
  let cancelOldStart: string | null = null
  let cancelWasLive = false
  if (body.status === 'cancelled') {
    const { data: existing } = await supabase
      .from('bookings').select('acuity_block_ids, gcal_event_id, square_payment_id, total_amount, auth_user_id, start_time, status, customers(name, email, phone)').eq('id', params.id).single()
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
    cancelOldStart = (existing as any)?.start_time ?? null
    cancelWasLive = (existing as any)?.status !== 'cancelled'
  }
  // For the change log: the start BEFORE an admin move (migration 134).
  let moveBefore: { start_time: string; auth_user_id: string | null; email: string | null } | null = null
  if (body.status !== 'cancelled' && body.start_time !== undefined) {
    const { data: cur0 } = await supabase
      .from('bookings').select('start_time, auth_user_id, customers(email)').eq('id', params.id).maybeSingle()
    if (cur0) moveBefore = { start_time: (cur0 as any).start_time, auth_user_id: (cur0 as any).auth_user_id ?? null, email: (cur0 as any).customers?.email ?? null }
  }
  if (body.start_time   !== undefined) updates.start_time   = body.start_time
  if (body.end_time     !== undefined) updates.end_time     = body.end_time
  if (body.notes        !== undefined) updates.notes        = body.notes
  // Moving or resizing the window keeps the guest surcharge and extra-person
  // fee at the per-hour rates the booking was sold at (lib/guest-rate). Without
  // this the stored totals stay put while the hours change, and every later
  // add-time divides them into the wrong per-hour price.
  if (body.status !== 'cancelled' && (body.start_time !== undefined || body.end_time !== undefined)) {
    const { data: g, error: gErr } = await supabase
      .from('bookings').select('start_time, end_time, guest_surcharge_amount, guest_fee_amount').eq('id', params.id).maybeSingle()
    if (gErr) console.error('[admin booking PATCH] guest amount lookup failed (amounts left as-is):', gErr)
    else if (g) Object.assign(updates, guestAmountsForWindow(g as any, body.start_time ?? (g as any).start_time, body.end_time ?? (g as any).end_time))
  }
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

  // ── Is the new window actually free? ──────────────────────────────────────
  //
  // ⚠️ The database's no_overlap GIST constraint was the ONLY thing guarding
  // this path, and it keys on set_id — so a FULL-WAREHOUSE BUYOUT, which is one
  // row with set_id NULL, is invisible to it. An admin could move a session
  // straight into a confirmed buyout and the write would succeed. That is the
  // same blindness that sold two bookings inside a buyout on 2026-08-22; the
  // public paths were fixed then, this one was not.
  //
  // Runs BEFORE the write so the refusal names what it collided with, instead of
  // the constraint's "conflicts with another booking" after the fact. The
  // constraint stays as the backstop below — this is not a replacement for it.
  //
  // ⚠️ Excludes THIS booking, or a nudge from 6:00 to 6:30 conflicts with the
  // very row being moved. Cancelling is exempt: a cancellation frees the slot.
  // ⚠️ `force: true` is the escape hatch. The set-vs-set case is refused by the
  // database regardless, so this only ever waives the BUYOUT check — a thing an
  // admin could do silently until now. There is no button for it: it exists so
  // that a real "the buyout client agreed to share" situation at 11pm is a
  // deliberate API call rather than a wall, and so adding a button later is a
  // UI decision instead of a rewrite.
  if (!body.force && body.status !== 'cancelled' && (body.start_time !== undefined || body.end_time !== undefined)) {
    const { data: cur } = await supabase
      .from('bookings').select('start_time, end_time, set_id, sets(name)').eq('id', params.id).single()
    const startISO = updates.start_time ?? cur?.start_time
    const endISO   = updates.end_time   ?? cur?.end_time
    // set_id may be changing in this same PATCH (the modal can move sets).
    const setId    = updates.set_id !== undefined ? updates.set_id : cur?.set_id
    const setName  = body.setName ?? (cur as any)?.sets?.name ?? 'this set'

    if (startISO && endISO) {
      try {
        if (setId) {
          const { ok, conflicts } = await checkSetWindows(
            supabase, [{ setId, setName, startISO, endISO }], params.id,
            { ignoreClosures: true },   // admin may book over a closure
          )
          if (!ok) return NextResponse.json({ error: conflicts.map(c => c.reason).join(' ') }, { status: 409 })
        } else {
          // set_id null = a full-warehouse buyout. The reverse question: is the
          // whole floor clear? Without this branch a buyout skipped the check
          // entirely, exactly as both booking paths used to.
          const { ok, conflicts } = await checkBuyoutWindow(supabase, startISO, endISO, params.id, { ignoreClosures: true })
          if (!ok) {
            return NextResponse.json({
              error: `${conflicts.map(c => c.reason).join(' ')} Nothing was changed.`,
              overridable: true,
            }, { status: 409 })
          }
        }
      } catch (e: any) {
        // ⚠️ These throw rather than returning [] on a lookup failure, on
        // purpose — "no conflicts found" from a broken query is how the buyout
        // bug shipped. Refuse instead of guessing the floor is empty.
        console.error('[admin PATCH] availability check failed:', e)
        return NextResponse.json({
          error: 'Could not confirm that slot is free, so nothing was changed. Try again.',
        }, { status: 503 })
      }
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

  // Change log (migration 134). Admin rows are recorded but the late-change
  // meter counts customer rows only.
  if (body.status === 'cancelled' && cancelWasLive) {
    await logBookingChange(supabase, {
      bookingId: params.id, kind: 'cancel', actor: 'admin', via: 'admin',
      oldStartISO: cancelOldStart, authUserId: cancelAuthUserId, customerEmail: cancelCustomer.email ?? null,
    })
  } else if (moveBefore && body.start_time && new Date(body.start_time).getTime() !== new Date(moveBefore.start_time).getTime()) {
    await logBookingChange(supabase, {
      bookingId: params.id, kind: 'reschedule', actor: 'admin', via: 'admin',
      oldStartISO: moveBefore.start_time, newStartISO: body.start_time,
      authUserId: moveBefore.auth_user_id, customerEmail: moveBefore.email,
    })
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
        await adjustRewardForRefund(supabase, params.id, cancelTotalCents, 'booking cancelled and refunded')
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
        await adjustRewardForRefund(supabase, params.id, cancelTotalCents, 'booking cancelled to studio credit')
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

  // Mini Sessions: a moved or cancelled booking moves/cancels the clients' slots.
  if (body.status === 'cancelled' || body.start_time !== undefined || body.end_time !== undefined) {
    await reconcileMiniForBooking(supabase, params.id).catch(e => console.error('[admin booking] mini sessions sync failed', e))
  }
  return NextResponse.json({ success: true, refund: refundResult, credit: creditResult, doorCode: newDoorCode, doorCodeBack: newDoorCodeBack })
}
