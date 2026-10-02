import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { randomBytes } from 'crypto'
import { plusActive, shortNoticeActive, violatesAdvanceWindow, ADVANCE_WINDOW_ERROR } from '@/lib/short-notice'
import { bookingHourToISO } from '@/lib/booking-times'
import { sendShortNoticeRequestAlert } from '@/lib/email'
import { sendOwnerSMS } from '@/lib/sms'
import { standingForCustomerId, standingForEmail } from '@/lib/standing'
import { cardBelongsToUser } from '@/lib/card-verify'
import { sharedFloorSets } from '@/lib/shared-floor'

export const dynamic = 'force-dynamic'

// ── Shared-floor takeover requests ──────────────────────────────────────────
// A full-warehouse takeover normally needs the WHOLE floor empty. When a set is
// already booked inside the window, the customer can still ASK for the takeover
// on the understanding that the other session keeps its set for its time. Teddy
// approves it from the same approval page as short-notice requests, and approval
// charges the card on file at the full takeover rate (buyout_rate × hours).
//
// Stored in short_notice_requests with desired_set = 'studio' and
// reason = 'shared_buyout' — one approval pipeline, not two.

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')
const MIN_HOURS = 4
const OPEN_HOUR = 9  // matches the booking grid (SLOTS in BookClient)
const CLOSE_HOUR = 22

function fmtHour(h: number): string {
  const hr = Math.floor(h), mn = h % 1 ? '30' : '00'
  return `${hr % 12 === 0 ? 12 : hr % 12}:${mn}${hr >= 12 ? 'PM' : 'AM'}`
}

async function buyoutRateDollars(): Promise<number> {
  const { data } = await service.from('studio_settings').select('value').eq('key', 'buyout_rate').maybeSingle()
  return Number(data?.value) || 400
}

// GET ?hours=N → the price the customer is consenting to (server-side, same
// figure approval charges).
export async function GET(req: NextRequest) {
  const hours = Number(req.nextUrl.searchParams.get('hours'))
  if (!Number.isFinite(hours) || hours < MIN_HOURS || hours % 0.5 !== 0) {
    return NextResponse.json({ error: 'Invalid length' }, { status: 400 })
  }
  return NextResponse.json({ cents: Math.round((await buyoutRateDollars()) * hours * 100), minHours: MIN_HOURS })
}

export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) return NextResponse.json({ error: 'Please sign in to send a request.' }, { status: 401 })
  const email = user.email.toLowerCase()

  const [{ data: cust }, { data: profile }] = await Promise.all([
    service.from('customers').select('id, pricing_overrides, phone').eq('email', email).maybeSingle(),
    supabase.from('customer_profiles').select('full_name, phone').eq('id', user.id).maybeSingle(),
  ])
  const name  = profile?.full_name || email.split('@')[0]
  const phone = profile?.phone || cust?.phone || null

  const standing = cust?.id ? await standingForCustomerId(service, cust.id) : await standingForEmail(service, email)
  if (standing.level === 'suspended') {
    return NextResponse.json({ error: 'Booking is paused on this account. Text (832) 408-1631 if you have questions.' }, { status: 403 })
  }

  const body = await req.json().catch(() => ({} as any))
  const date  = typeof body.date === 'string' ? body.date.trim() : ''
  const start = Number(body.start)
  const hours = Number(body.hours)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date))                         return NextResponse.json({ error: 'Please choose a date.' }, { status: 400 })
  if (!Number.isFinite(start) || start % 1 !== 0 || start < OPEN_HOUR) return NextResponse.json({ error: 'Please choose a start time on the hour.' }, { status: 400 })
  if (!Number.isFinite(hours) || hours % 0.5 !== 0 || hours < MIN_HOURS) {
    return NextResponse.json({ error: `A full takeover is a ${MIN_HOURS}-hour minimum.` }, { status: 400 })
  }
  if (start + hours > CLOSE_HOUR) return NextResponse.json({ error: 'That would run past closing (10pm). Try a shorter session or an earlier start.' }, { status: 400 })
  if (body.consent !== true) return NextResponse.json({ error: 'Please confirm you agree to be charged if this is approved.' }, { status: 400 })

  const startISO = bookingHourToISO(date, start)
  const endISO   = bookingHourToISO(date, start + hours)
  if (Date.parse(startISO) <= Date.now()) return NextResponse.json({ error: 'That time has already passed.' }, { status: 400 })
  // Inside the advance window this is also a short-notice ask, which is Plus.
  const po = cust?.pricing_overrides ?? null
  if (violatesAdvanceWindow([date]) && !plusActive(po) && !shortNoticeActive(po)) {
    return NextResponse.json({ error: ADVANCE_WINDOW_ERROR }, { status: 400 })
  }

  // What's on the floor. Another takeover is a hard no; an empty floor means
  // they should just book it.
  const floor = await sharedFloorSets(service, startISO, endISO)
  if (floor.buyoutConflict) {
    return NextResponse.json({ error: 'Another full-warehouse takeover is already booked during that window.' }, { status: 409 })
  }
  if (!floor.sets.length) {
    return NextResponse.json({ error: 'The whole floor is free then — you can book it directly, no request needed.' }, { status: 400 })
  }

  const cents = Math.round((await buyoutRateDollars()) * hours * 100)

  let squareCardId: string | null = null
  const cardId = typeof body.squareCardId === 'string' ? body.squareCardId.trim() : ''
  if (cardId && await cardBelongsToUser(supabase, user.id, cardId)) squareCardId = cardId

  // One live shared-floor request per person; a second one replaces the first.
  const dupQ = service.from('short_notice_requests').select('id, approve_token')
    .eq('status', 'pending').eq('reason', 'shared_buyout').limit(1)
  const { data: dup } = cust?.id ? await dupQ.eq('customer_id', cust.id) : await dupQ.eq('customer_email', email)
  const existing = dup && dup.length ? dup[0] : null

  const sharedLine = floor.sets.map(s => `${s.setName} ${fmtHour(s.startHour)}–${fmtHour(s.endHour)}`).join(', ')
  const userNote = (typeof body.note === 'string' && body.note.trim()) ? body.note.trim().slice(0, 400) : ''
  const token = existing?.approve_token || randomBytes(20).toString('hex')
  const row = {
    customer_id:    cust?.id ?? null,
    customer_email: email,
    customer_name:  name,
    customer_phone: phone,
    status:         'pending',
    desired_set:    'studio',
    desired_date:   date,
    desired_start:  start,
    desired_hours:  hours,
    quoted_cents:   cents,
    square_card_id: squareCardId,
    consented_at:   new Date().toISOString(),
    note:           userNote || null,
    approve_token:  token,
    hold_expires_at: null,
    booking_id:      null,
    reason:         'shared_buyout',
  }
  const { error } = existing
    ? await service.from('short_notice_requests').update(row).eq('id', existing.id)
    : await service.from('short_notice_requests').insert(row)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const approveUrl = `${APP_URL}/short-notice/approve/${token}`
  await Promise.allSettled([
    sendShortNoticeRequestAlert({
      customerName: name, customerEmail: email,
      desiredSetName: 'Full warehouse — shared floor',
      desiredDate: date, desiredStart: start,
      note: `Shares the floor with: ${sharedLine}.${userNote ? ` Their note: ${userNote}` : ''}`,
      approveUrl,
    }),
    sendOwnerSMS([
      existing ? `🔁 ${name} CHANGED their shared-floor takeover request:` : `🏭 Shared-floor takeover request from ${name}:`,
      `Full warehouse ${date} ${fmtHour(start)}–${fmtHour(start + hours)} (${hours} hr)`,
      `· $${(cents / 100).toFixed(2)}${squareCardId ? ' (card on file)' : ' (no card — link)'}`,
      `\nAlready booked: ${sharedLine}`,
      `\nApprove: ${approveUrl}`,
    ].join(' ')),
  ])

  return NextResponse.json({ ok: true, status: 'pending', replaced: !!existing, cents })
}
