// GET  /api/manage/[token]  → the booking behind an emailed manage link
// POST /api/manage/[token]  { date, startHour } → move it
//
// The way a GUEST reaches their own booking. Booking without an account used to
// be a one-way door: /api/account/... needs a Supabase session, and a guest
// booking has auth_user_id null, so every change went through Teddy by text.
//
// ⚠️ POSSESSION OF THE TOKEN *IS* THE AUTHORIZATION. It is a 128-bit value that
// only ever went to the email address on the booking, and the lookup is BY the
// token — so a caller can only ever reach the one booking their link belongs to.
// There is no id in the URL to tamper with.
//
// ⚠️ Everything past authorization is lib/reschedule.ts, the same function the
// signed-in route calls. That is the whole point of this file being thin: the
// 48-hour rule, the Acuity refusal, opening hours, the availability check and
// the door-code re-mint cannot be present on one path and missing on the other.
//
// ⚠️ Deliberately NOT here: cancelling, refunds, card details, anything about
// another booking. A bearer link that lives in an inbox forever should be able
// to do the smallest useful thing. Widening it is a decision, not a tweak.

import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { rescheduleBooking, rescheduleFailed, SELF_SERVE_HOURS } from '@/lib/reschedule'
import { plusActive } from '@/lib/short-notice'
import { centralDateStr, centralHourDecimal } from '@/lib/booking-times'

export const dynamic = 'force-dynamic'

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// A token is a dashless uuid (migration 101). Reject anything else before it
// reaches the database — a malformed token is never a real link.
const TOKEN_RE = /^[0-9a-f]{32}$/i

const SELECT = `
  id, start_time, end_time, status, set_id, acuity_appointment_id, total_amount,
  door_code, door_code_back,
  customers ( name, email, phone ),
  sets ( name, slug )
`

async function load(token: string) {
  if (!TOKEN_RE.test(token)) return null
  const { data, error } = await service
    .from('bookings').select(SELECT).eq('manage_token', token).maybeSingle()
  // ⚠️ Read `error` — supabase-js does not throw on a Postgres error, so without
  // this a failed lookup would be indistinguishable from "no such token" and the
  // customer would be told their link was invalid when the database was down.
  if (error) { console.error('[manage] lookup error:', error); return { dbError: true } as const }
  return data as any
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const b = await load(params.token)
  if (b && (b as any).dbError) {
    return NextResponse.json({ error: 'We could not load your booking just now — please try again.' }, { status: 503 })
  }
  if (!b) return NextResponse.json({ error: 'That link is not valid. Text (832) 408-1631 and we can help.' }, { status: 404 })

  const cust = b.customers ?? {}
  const setRow = b.sets ?? {}
  const startMs = Date.parse(b.start_time)
  const hoursUntil = (startMs - Date.now()) / 3_600_000

  const { data: custRow } = await service
    .from('customers').select('pricing_overrides')
    .eq('email', String(cust.email ?? '').toLowerCase().trim()).maybeSingle()
  const isPlus = plusActive(custRow?.pricing_overrides ?? null)

  // Why the customer may NOT move this one, in the same order lib/reschedule.ts
  // would refuse — so the page can explain up front instead of letting them pick
  // a time and then rejecting it.
  let lockedReason: string | null = null
  if (b.status === 'cancelled') lockedReason = 'This booking was cancelled.'
  else if (startMs <= Date.now()) lockedReason = 'This session has already started.'
  else if (!b.set_id) lockedReason = 'Full-studio bookings are rescheduled by the team — text (832) 408-1631.'
  else if (b.acuity_appointment_id) lockedReason = 'This booking was made through our scheduler, so a change has to go through us — text (832) 408-1631.'
  else if (hoursUntil < SELF_SERVE_HOURS) {
    // ⚠️ Plus is refused HERE too, even though lib/reschedule.ts would allow it.
    // The picker needs /api/plus/open-blocks to know which short-notice hours
    // are open, and that route reads the VERIFIED SESSION — on a manage link
    // there isn't one, so it returns no blocks and every slot renders as
    // 'closed'. Showing a Plus member a fully greyed calendar with no
    // explanation is worse than telling them the truth: their door is signing
    // in, which works today. Do not "fix" this by passing isPlus through to the
    // picker without also giving that route a token-based identity.
    lockedReason = isPlus
      ? `Inside ${SELF_SERVE_HOURS} hours, Plus members can move a session from their account — sign in at madekulture.com, or text (832) 408-1631 and we’ll do it for you.`
      : `Inside ${SELF_SERVE_HOURS} hours of your session, changes are handled by the team — text (832) 408-1631 and we’ll sort it out.`
  }

  return NextResponse.json({
    booking: {
      id: b.id,
      start_time: b.start_time,
      end_time: b.end_time,
      status: b.status,
      setName: setRow.name ?? 'Your set',
      setSlug: setRow.slug ?? null,
      date: centralDateStr(b.start_time),
      startHour: centralHourDecimal(b.start_time),
      endHour: centralHourDecimal(b.end_time),
      total: b.total_amount,
      customerName: cust.name ?? null,
      // ⚠️ Door codes are returned because this page is reached only by someone
      // holding the link that was emailed to the booking's own address — the
      // same channel the codes were sent through. Nothing else identifying is
      // exposed: no card, no email, no phone, no other booking.
      doorCode: b.door_code ?? null,
      doorCodeBack: b.door_code_back ?? null,
    },
    isPlus,
    canReschedule: lockedReason === null,
    lockedReason,
  })
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const b = await load(params.token)
  if (b && (b as any).dbError) {
    return NextResponse.json({ error: 'We could not load your booking just now — please try again.' }, { status: 503 })
  }
  if (!b) return NextResponse.json({ error: 'That link is not valid. Text (832) 408-1631 and we can help.' }, { status: 404 })

  const body = await req.json().catch(() => ({} as any))

  const result = await rescheduleBooking(service, {
    bookingId: b.id,
    date: typeof body.date === 'string' ? body.date.trim() : '',
    startHour: Number(body.startHour),
    via: 'manage-link',
    // No session here — the booking's own customer is the identity, which is
    // exactly who the link was sent to.
    actorEmail: b.customers?.email ?? null,
  })

  // rescheduleFailed, not `!result.ok` — see the note on it in lib/reschedule.ts.
  if (rescheduleFailed(result)) return NextResponse.json({ error: result.error }, { status: result.status })
  return NextResponse.json({
    success: true,
    startISO: result.startISO,
    endISO: result.endISO,
    when: result.when,
    doorCode: result.doorCode,
    doorCodeBack: result.doorCodeBack,
  })
}
