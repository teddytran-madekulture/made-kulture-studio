// POST /api/account/bookings/[id]/reschedule   { date: 'YYYY-MM-DD', startHour: number }
//
// Move an upcoming booking to a new start time, keeping the SAME booking, the
// same set, the same duration and the same price. Nothing about money moves.
//
// Why same-shape only: a different set or a different length changes the price,
// and pricing a move means charging up or refunding down days after the original
// payment — a second money path. Longer already has a home (extensions); a
// different shape already has one (reschedule-credit: bank it, rebook). See
// Reschedule_Spec.md.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
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

export const dynamic = 'force-dynamic'

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// A customer may move a booking freely up to this point; inside it, only Plus.
const SELF_SERVE_HOURS = 48
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

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({} as any))
  const date = typeof body.date === 'string' ? body.date.trim() : ''
  const startHour = Number(body.startHour)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: 'Pick a date.' }, { status: 400 })
  if (!Number.isFinite(startHour) || startHour % 1 !== 0) {
    return NextResponse.json({ error: 'Sessions start on the hour.' }, { status: 400 })
  }

  const { data: booking, error: fetchErr } = await service
    .from('bookings')
    .select('id, start_time, end_time, status, set_id, auth_user_id, gcal_event_id, acuity_appointment_id, total_amount, customers(name, email, phone), sets(name)')
    .eq('id', params.id)
    .maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  // ⚠️ Ownership from the VERIFIED session, never a body field.
  const cust: any = (booking as any).customers
  const setRow: any = (booking as any).sets
  if (booking.auth_user_id !== user.id && cust?.email !== user.email) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  if (booking.status === 'cancelled') {
    return NextResponse.json({ error: 'This booking was cancelled — book a new session instead.' }, { status: 400 })
  }
  if (!booking.set_id) {
    return NextResponse.json({ error: 'Full-studio bookings are rescheduled by the team — text (832) 408-1631 and we’ll sort it out.' }, { status: 400 })
  }
  // ⚠️ An Acuity-sourced booking is ALSO held in Acuity, and moving it here does
  // not move it there — the old slot would stay blocked and the new one would be
  // double-bookable. Roughly seven of eight sessions still arrive that way.
  if (booking.acuity_appointment_id) {
    return NextResponse.json({ error: 'This booking was made through our scheduler, so a change has to go through us — text (832) 408-1631 and we’ll move it.' }, { status: 400 })
  }

  const oldStartMs = Date.parse(booking.start_time)
  const oldEndMs   = Date.parse(booking.end_time)
  const now = Date.now()
  if (oldStartMs <= now) {
    return NextResponse.json({ error: 'That session has already started.' }, { status: 400 })
  }

  // Inside the self-serve window, only Plus may move a booking. Everyone else
  // gets a person — same shape as the published cancellation policy.
  const { data: custRow } = await service
    .from('customers').select('pricing_overrides').eq('email', String(cust?.email ?? user.email).toLowerCase().trim()).maybeSingle()
  const isPlus = plusActive(custRow?.pricing_overrides ?? null)
  const hoursUntil = (oldStartMs - now) / 3_600_000
  if (hoursUntil < SELF_SERVE_HOURS && !isPlus) {
    return NextResponse.json({
      error: `Inside ${SELF_SERVE_HOURS} hours of your session, changes are handled by the team — text (832) 408-1631 and we’ll sort it out.`,
    }, { status: 400 })
  }

  // ── Same duration, new start ────────────────────────────────────────────
  const durationHours = (oldEndMs - oldStartMs) / 3_600_000
  const endHour = startHour + durationHours
  if (startHour < OPEN_HOUR || endHour > CLOSE_HOUR) {
    return NextResponse.json({
      error: `Your session is ${durationHours} hour${durationHours === 1 ? '' : 's'} long, so it needs a start between ${fmt12(OPEN_HOUR)} and ${fmt12(CLOSE_HOUR - durationHours)}.`,
    }, { status: 400 })
  }

  // ⚠️ BOTH ends emitted by bookingHourToISO. The stored shape is local wall-clock
  // with a computed offset, NOT a UTC instant — `isoToHour` in booking-core still
  // slices characters 11–13, so a `...Z` end time would be read as the wrong hour.
  // See dst-central-offset.
  const newStartISO = bookingHourToISO(date, startHour)
  const newEndISO   = bookingHourToISO(date, endHour)
  const newStartMs  = Date.parse(newStartISO)

  if (!Number.isFinite(newStartMs)) return NextResponse.json({ error: 'That time didn’t make sense — try again.' }, { status: 400 })
  if (newStartMs - now < MIN_LEAD_MS) {
    return NextResponse.json({ error: 'Please pick a time at least 2 hours from now.' }, { status: 400 })
  }
  // ⚠️ Compare INSTANTS, not strings. Supabase returns `2026-08-13T15:00:00+00:00`
  // (UTC) while bookingHourToISO emits `2026-08-13T10:00:00-05:00` (local wall
  // clock) — the same moment, spelled two different ways. String equality never
  // matched, so a "move" to the time it already had returned 200: it re-minted
  // the door codes, texted the customer a new code for no reason, and told the
  // owner a booking had moved when nothing had. Same family as the positional
  // slicing in dst-central-offset — never compare timestamps as text.
  if (newStartMs === oldStartMs && Date.parse(newEndISO) === oldEndMs) {
    return NextResponse.json({ error: 'That’s the time you already have.' }, { status: 400 })
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
      return NextResponse.json({
        error: `Sessions need ${SELF_SERVE_HOURS} hours’ notice. Text (832) 408-1631 and we’ll see what we can do.`,
      }, { status: 400 })
    }
    const ok = await sessionMayInstantBook(
      service, user.email,
      [{ setId: booking.set_id, startISO: newStartISO, endISO: newEndISO }],
      booking.id,
    )
    if (!ok) return NextResponse.json({ error: PLUS_INSTANT_ERROR }, { status: 400 })
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
    return NextResponse.json({ error: conflicts.map(c => c.reason).join(' ') }, { status: 409 })
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
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  if (!moved?.length) {
    return NextResponse.json({ error: 'That booking just changed somewhere else — reload and try again.' }, { status: 409 })
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
      ...(movingIntoWindow ? ['(short notice — inside the 48h window)'] : []),
      ...(doorCode ? [`New front code: ${doorCode}`] : []),
    ].join('\n')).catch(() => {}),
    sendOwnerPush({
      title: '🔄 Booking moved',
      body: `${cust?.name || 'A customer'} — ${setName} → ${whenNew}`,
      url: '/admin/dashboard',
    }).catch(() => {}),
  ])

  return NextResponse.json({
    success: true,
    startISO: newStartISO,
    endISO: newEndISO,
    when: whenNew,
    doorCode,
    doorCodeBack,
  })
}
