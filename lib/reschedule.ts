// Moving a booking in place — the shared core.
//
// Same booking, same set, same duration, same price. Only the start moves, so no
// money changes hands. Why same-shape only: a different set or a different length
// changes the price, and pricing a move means charging up or refunding down days
// after the original payment — a second money path. Longer already has a home
// (extensions); a different shape already has one (reschedule-credit: bank it,
// rebook). See Reschedule_Spec.md.
//
// ⚠️ THIS FILE EXISTS SO THE GATES CANNOT DRIFT. There are two ways to reach a
// reschedule — a signed-in customer (/api/account/bookings/[id]/reschedule) and
// a guest holding an emailed manage link (/api/manage/[token]) — and they must
// enforce the identical 48-hour rule, Acuity refusal, opening-hours check,
// availability check, self-exclusion and door-code re-mint. Shipping a second
// copy of that list is how the short-notice charge button ended up on one
// approval surface and not the other (see admin-two-sidebars). Callers do their
// OWN authorization and then hand the work to this function; everything after
// authorization lives here exactly once.

import type { SupabaseClient } from '@supabase/supabase-js'
import { plusActive } from '@/lib/short-notice'
import { sessionMayInstantBook, PLUS_INSTANT_ERROR } from '@/lib/plus-instant-book'
import { checkSetWindows } from '@/lib/set-availability'
import { bookingHourToISO, centralDateStr, centralHourDecimal } from '@/lib/booking-times'
import { issueDoorCodes, DOOR_CODE_HOWTO } from '@/lib/igloohome'
import { patchCalendarEvent } from '@/lib/gcal'
import { notifyCoverageGap } from '@/lib/coverage'
import { sendSimpleEmail, formatDateLabel, formatTimeLabel } from '@/lib/email'
import { sendSMS, sendOwnerSMS } from '@/lib/sms'
import { sendOwnerPush } from '@/lib/push'

// A customer may move a booking freely up to this point; inside it, only Plus.
export const SELF_SERVE_HOURS = 48
// Nothing may be moved to start sooner than this — matches the Plus lead time,
// and stops "reschedule to 10 minutes from now" from being a way to summon the
// owner to the building.
const MIN_LEAD_MS = 2 * 60 * 60 * 1000

const CLOSE_HOUR = 22
const OPEN_HOUR  = 9

function fmt12(h: number): string {
  const hr = Math.floor(h), mn = h % 1 ? '30' : '00'
  return `${hr % 12 === 0 ? 12 : hr % 12}:${mn}${hr >= 12 ? 'PM' : 'AM'}`
}

/**
 * How the caller proved this person may move this booking.
 *
 * ⚠️ Authorization happens in the ROUTE, before this is called — a session is
 * checked against auth_user_id/email, a manage token is checked by looking the
 * booking up BY that token. This type only records which happened, so the
 * owner-facing notifications can say so.
 */
export type RescheduleVia = 'account' | 'manage-link'

export interface RescheduleInput {
  bookingId: string
  date: string          // YYYY-MM-DD
  startHour: number     // whole hour, local
  via: RescheduleVia
  /**
   * Identity used for the Plus / instant-book checks. For a signed-in customer
   * this is the SESSION email (preserving the original behaviour); for a manage
   * link there is no session, so the caller passes the booking's customer email.
   */
  actorEmail: string | null
}

export interface RescheduleOk {
  ok: true
  startISO: string
  endISO: string
  when: string
  doorCode: string | null
  doorCodeBack: string | null
}
export interface RescheduleFail {
  ok: false
  error: string
  status: number
}
export type RescheduleResult = RescheduleOk | RescheduleFail

/**
 * ⚠️ Narrowing helper, and it is not decoration. tsconfig has `strict: false`,
 * which turns off strictNullChecks — and without it TypeScript does not narrow
 * a discriminated union on `ok`, so `if (!result.ok) return result.error` fails
 * to compile. Three existing routes (delegate, short-notice/[token],
 * api/bookings promo) carry that error today. Callers use this instead.
 */
export function rescheduleFailed(r: RescheduleResult): r is RescheduleFail {
  return r.ok === false
}

export async function rescheduleBooking(
  service: SupabaseClient,
  input: RescheduleInput,
): Promise<RescheduleResult> {
  const { bookingId, date, startHour, via, actorEmail } = input

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: 'Pick a date.', status: 400 }
  if (!Number.isFinite(startHour) || startHour % 1 !== 0) {
    return { ok: false, error: 'Sessions start on the hour.', status: 400 }
  }

  const { data: booking, error: fetchErr } = await service
    .from('bookings')
    .select('id, start_time, end_time, status, set_id, auth_user_id, gcal_event_id, acuity_appointment_id, total_amount, customers(name, email, phone), sets(name)')
    .eq('id', bookingId)
    .maybeSingle()
  if (fetchErr) return { ok: false, error: fetchErr.message, status: 500 }
  if (!booking) return { ok: false, error: 'Booking not found', status: 404 }

  const cust: any = (booking as any).customers
  const setRow: any = (booking as any).sets

  if (booking.status === 'cancelled') {
    return { ok: false, error: 'This booking was cancelled — book a new session instead.', status: 400 }
  }
  if (!booking.set_id) {
    return { ok: false, error: 'Full-studio bookings are rescheduled by the team — text (832) 408-1631 and we’ll sort it out.', status: 400 }
  }
  // ⚠️ An Acuity-sourced booking is ALSO held in Acuity, and moving it here does
  // not move it there — the old slot would stay blocked and the new one would be
  // double-bookable. Roughly seven of eight sessions still arrive that way.
  if (booking.acuity_appointment_id) {
    return { ok: false, error: 'This booking was made through our scheduler, so a change has to go through us — text (832) 408-1631 and we’ll move it.', status: 400 }
  }

  const oldStartMs = Date.parse(booking.start_time)
  const oldEndMs   = Date.parse(booking.end_time)
  const now = Date.now()
  if (oldStartMs <= now) {
    return { ok: false, error: 'That session has already started.', status: 400 }
  }

  // Inside the self-serve window, only Plus may move a booking. Everyone else
  // gets a person — same shape as the published cancellation policy.
  const plusEmail = String(cust?.email ?? actorEmail ?? '').toLowerCase().trim()
  const { data: custRow } = await service
    .from('customers').select('pricing_overrides').eq('email', plusEmail).maybeSingle()
  const isPlus = plusActive(custRow?.pricing_overrides ?? null)
  const hoursUntil = (oldStartMs - now) / 3_600_000
  if (hoursUntil < SELF_SERVE_HOURS && !isPlus) {
    return {
      ok: false,
      error: `Inside ${SELF_SERVE_HOURS} hours of your session, changes are handled by the team — text (832) 408-1631 and we’ll sort it out.`,
      status: 400,
    }
  }

  // ── Same duration, new start ────────────────────────────────────────────
  const durationHours = (oldEndMs - oldStartMs) / 3_600_000
  const endHour = startHour + durationHours
  if (startHour < OPEN_HOUR || endHour > CLOSE_HOUR) {
    return {
      ok: false,
      error: `Your session is ${durationHours} hour${durationHours === 1 ? '' : 's'} long, so it needs a start between ${fmt12(OPEN_HOUR)} and ${fmt12(CLOSE_HOUR - durationHours)}.`,
      status: 400,
    }
  }

  // ⚠️ BOTH ends emitted by bookingHourToISO. The stored shape is local wall-clock
  // with a computed offset, NOT a UTC instant — `isoToHour` in booking-core still
  // slices characters 11–13, so a `...Z` end time would be read as the wrong hour.
  // See dst-central-offset.
  const newStartISO = bookingHourToISO(date, startHour)
  const newEndISO   = bookingHourToISO(date, endHour)
  const newStartMs  = Date.parse(newStartISO)

  if (!Number.isFinite(newStartMs)) return { ok: false, error: 'That time didn’t make sense — try again.', status: 400 }
  if (newStartMs - now < MIN_LEAD_MS) {
    return { ok: false, error: 'Please pick a time at least 2 hours from now.', status: 400 }
  }
  // ⚠️ Compare INSTANTS, not strings. Supabase returns `2026-08-13T15:00:00+00:00`
  // (UTC) while bookingHourToISO emits `2026-08-13T10:00:00-05:00` (local wall
  // clock) — the same moment, spelled two different ways. String equality never
  // matched, so a "move" to the time it already had returned 200: it re-minted
  // the door codes, texted the customer a new code for no reason, and told the
  // owner a booking had moved when nothing had. Same family as the positional
  // slicing in dst-central-offset — never compare timestamps as text.
  if (newStartMs === oldStartMs && Date.parse(newEndISO) === oldEndMs) {
    return { ok: false, error: 'That’s the time you already have.', status: 400 }
  }

  // ── Moving INTO the advance window is a Plus-only, contained move ────────
  // A Plus member can only land on hours the studio is already open for, exactly
  // as when booking. Anything else is a short-notice REQUEST, not a reschedule.
  // ⚠️ This booking is excluded from the recompute — otherwise it anchors its own
  // new slot and every move inside the window would "fit".
  const minAdvance = new Date(now + SELF_SERVE_HOURS * 3_600_000)
  const movingIntoWindow = newStartMs < minAdvance.getTime()
  if (movingIntoWindow) {
    if (!isPlus) {
      return {
        ok: false,
        error: `Sessions need ${SELF_SERVE_HOURS} hours’ notice. Text (832) 408-1631 and we’ll see what we can do.`,
        status: 400,
      }
    }
    const ok = await sessionMayInstantBook(
      service, actorEmail ?? cust?.email ?? null,
      [{ setId: booking.set_id, startISO: newStartISO, endISO: newEndISO }],
      booking.id,
    )
    if (!ok) return { ok: false, error: PLUS_INSTANT_ERROR, status: 400 }
  }

  // ── Is the new window actually free? ────────────────────────────────────
  // Excluding this booking, or a move overlapping its own original slot would
  // conflict with itself.
  const { ok: free, conflicts } = await checkSetWindows(
    service,
    [{ setId: booking.set_id, setName: setRow?.name ?? 'Your set', startISO: newStartISO, endISO: newEndISO }],
    booking.id,
  )
  if (!free) {
    return { ok: false, error: conflicts.map(c => c.reason).join(' '), status: 409 }
  }

  // ── Move it ─────────────────────────────────────────────────────────────
  // ⚠️ start_time and end_time ONLY. total_amount is deliberately untouched: a
  // same-shape move costs the same, and writing a recomputed total here is
  // exactly how a paid booking ended up $32.50 under Square on 2026-08-09.
  // ⚠️ Written as a CLAIM on the old start so two taps can't both "succeed", and
  // .select() proves a row actually changed — supabase-js does not throw.
  const { data: moved, error: upErr } = await service
    .from('bookings')
    .update({ start_time: newStartISO, end_time: newEndISO })
    .eq('id', booking.id)
    .eq('start_time', booking.start_time)
    .select('id')
  if (upErr) return { ok: false, error: upErr.message, status: 500 }
  if (!moved?.length) {
    return { ok: false, error: 'That booking just changed somewhere else — reload and try again.', status: 409 }
  }

  // ── New door codes for the new window ───────────────────────────────────
  // The existing algoPIN was minted for the OLD window and stops working at its
  // old end time — without this the customer arrives to a locked building.
  //
  // ⚠️ The OLD code stays valid for the ORIGINAL window and CANNOT be revoked.
  // That is not new: every cancellation already leaves one live. Accepted, not
  // solved — see smart-lock-door-system.
  let doorCode: string | null = null
  let doorCodeBack: string | null = null
  try {
    const codes = await issueDoorCodes(service, booking.id, {
      startISO: newStartISO,
      endISO:   newEndISO,
      accessName: `MK ${cust?.name || 'booking'}`.slice(0, 40),
    })
    doorCode = codes.doorCode
    doorCodeBack = codes.doorCodeBack
  } catch (e) {
    console.error('[reschedule] door code error (non-fatal):', e)
  }

  // Calendar + staffing, both non-fatal.
  try {
    if (booking.gcal_event_id) await patchCalendarEvent(booking.gcal_event_id, { startISO: newStartISO, endISO: newEndISO })
  } catch (e) {
    console.error('[reschedule] gcal patch error (non-fatal):', e)
  }
  await notifyCoverageGap(booking.id).catch(() => {})

  // ── Tell the customer, and tell the owner ───────────────────────────────
  const setName  = setRow?.name ?? 'Your set'
  const whenNew  = `${formatDateLabel(date)}, ${formatTimeLabel(startHour)} – ${formatTimeLabel(endHour)}`
  const whenOld  = `${formatDateLabel(centralDateStr(booking.start_time))}, ${formatTimeLabel(centralHourDecimal(booking.start_time))}`
  // Emoji and the en dash below are left exactly as they were: lib/sms.ts runs
  // gsmSafe() on every body, so they are folded before Twilio sees them and cost
  // nothing. Changing the customer-visible wording during an extraction would
  // mean a later bug report couldn't be pinned on the new path vs the move.
  const codeLines = [
    doorCode ? `🔑 Front-door code: ${doorCode.replace(/(\d{3})(?=\d)/g, '$1 ')}` : null,
    doorCodeBack ? `🔑 Back-door code: ${doorCodeBack.replace(/(\d{3})(?=\d)/g, '$1 ')}` : null,
  ].filter(Boolean) as string[]
  if (codeLines.length) codeLines.push(DOOR_CODE_HOWTO, '(your previous codes no longer apply)')

  await Promise.allSettled([
    cust?.phone ? sendSMS(cust.phone, [
      `✅ Made Kulture — session moved.`, ``,
      `📍 ${setName}`,
      `🗓 ${whenNew}`,
      ...(codeLines.length ? ['', ...codeLines] : []),
      ``, `Questions? Text (832) 408-1631.`,
    ].join('\n')) : Promise.resolve(),
    cust?.email ? sendSimpleEmail({
      to: cust.email,
      subject: `Your Made Kulture session moved to ${whenNew}`,
      heading: 'Your session has been moved',
      paragraphs: [
        `<strong style="color:#fff;">${setName}</strong>`,
        `New time: <strong style="color:#fff;">${whenNew}</strong>`,
        `Previously: ${whenOld}`,
        ...(doorCode ? [`Your new front-door code is <strong style="color:#fff;">${doorCode}</strong>${doorCodeBack ? ` and the back door is <strong style="color:#fff;">${doorCodeBack}</strong>` : ''}. Your previous codes no longer apply.`] : []),
        `Nothing was charged — your session is the same length and the same price.`,
      ],
      label: 'booking_rescheduled',
    }) : Promise.resolve(),
    // ⚠️ The owner has to know. A customer silently moving a session is how
    // somebody ends up opening the building at the wrong hour — or not at all.
    sendOwnerSMS([
      `🔄 ${cust?.name || 'A customer'} moved a booking`,
      `${setName}: ${whenOld} → ${whenNew}`,
      // Worth knowing which door it came through: a manage-link move was made by
      // someone holding an emailed link, not a verified account.
      ...(via === 'manage-link' ? ['(via emailed manage link)'] : []),
      ...(movingIntoWindow ? ['(short notice — inside the 48h window)'] : []),
      ...(doorCode ? [`New front code: ${doorCode}`] : []),
    ].join('\n')).catch(() => {}),
    sendOwnerPush({
      title: '🔄 Booking moved',
      body: `${cust?.name || 'A customer'} — ${setName} → ${whenNew}`,
      url: '/admin/dashboard',
    }).catch(() => {}),
  ])

  return { ok: true, startISO: newStartISO, endISO: newEndISO, when: whenNew, doorCode, doorCodeBack }
}
