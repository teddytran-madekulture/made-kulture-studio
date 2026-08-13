import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { Client, Environment } from 'square'
import { randomUUID } from 'crypto'
import { sendShortNoticeApprovedEmail, sendSimpleEmail } from '@/lib/email'
import { sendSMS, toE164 } from '@/lib/sms'
import { sendOwnerPush } from '@/lib/push'
import { bookingHourToISO } from '@/lib/booking-times'
import {
  validateAndPriceOrder, insertBookingRows, finalizeBooking, fmt12,
  SLUG_TO_NAME, type BookingCoreInput,
} from '@/lib/booking-core'

export const dynamic = 'force-dynamic'

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const square = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN!,
  environment: process.env.SQUARE_ENVIRONMENT === 'production' ? Environment.Production : Environment.Sandbox,
})

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')

// How long a slot stays held while an unpaid payment link is outstanding.
// ⚠️ Capped by the session start as well — see holdExpiryFor(). Holding past the
// moment the session begins would keep a set blocked for hours nobody can use.
const HOLD_MS = 2 * 60 * 60 * 1000

// The columns every read of a request needs. Kept in one place so the approve
// path can never act on a row it only half-loaded.
const REQ_COLS =
  'id, customer_id, customer_email, customer_name, customer_phone, status, note, ' +
  'desired_set, desired_date, desired_start, desired_hours, quoted_cents, ' +
  'square_card_id, consented_at, hold_expires_at, booking_id'

// ⚠️ REQ_COLS is built by concatenation, so supabase-js cannot infer the row
// shape from it (it infers from a LITERAL select string). Without this the
// result types as GenericStringError and every field access below is an error.
// The row is described here once rather than casting at each call site.
interface ShortNoticeRow {
  id: string
  customer_id: string | null
  customer_email: string
  customer_name: string | null
  customer_phone: string | null
  status: string
  note: string | null
  desired_set: string | null
  desired_date: string | null
  desired_start: number | null
  desired_hours: number | null
  quoted_cents: number | null
  square_card_id: string | null
  consented_at: string | null
  hold_expires_at: string | null
  booking_id: string | null
  granted_until?: string | null
  granted_expires_at?: string | null
  requested_at?: string | null
}

// today + N days as YYYY-MM-DD (UTC — matches shortNoticeActive's date compare).
function datePlusDays(n: number): string {
  const d = new Date(); d.setDate(d.getDate() + n)
  return d.toISOString().split('T')[0]
}

// Read the studio-configured grant length in minutes (default 60).
async function grantMinutes(): Promise<number> {
  const { data } = await service.from('studio_settings').select('value').eq('key', 'short_notice_grant_minutes').maybeSingle()
  const n = Number(data?.value)
  return Number.isFinite(n) && n > 0 ? n : 60
}

// 2 hours from now, or the moment the session starts — whichever comes first.
function holdExpiryFor(startISO: string): string {
  return new Date(Math.min(Date.now() + HOLD_MS, Date.parse(startISO))).toISOString()
}

function dollars(cents: number): string {
  return (cents / 100).toFixed(2)
}

// ── Decline reasons ─────────────────────────────────────────────────────────
// ⚠️ Denying used to send the customer NOTHING. They asked, the row flipped to
// `denied`, and they were left waiting for a text that would never come — the
// worst outcome of the three, because it looks like nobody read it.
//
// Canned lines so a no takes one tap, with an optional line of your own. Each
// one ends with a way forward: a decline should teach them how to ask better,
// not just close the door.
const DENY_REASONS: Record<string, string> = {
  booked: 'that time’s already booked',
  closed: 'we’re not open then',
  notice: 'that’s too short notice for us to get someone there',
  other:  '',
}

// A request is chargeable only if it was priced AND consented to. Anything less
// is a pre-auto-pay request and approval falls back to unlocking them to book.
function isChargeable(r: ShortNoticeRow | null): boolean {
  return !!(r?.quoted_cents != null && r?.desired_hours != null
    && r?.consented_at != null && r?.desired_set && r?.desired_date && r?.desired_start != null)
}

// GET /api/short-notice/[token] — request details for the owner's approval page.
export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const { data: raw, error } = await service
    .from('short_notice_requests')
    .select(REQ_COLS + ', granted_until, granted_expires_at, requested_at')
    .eq('approve_token', params.token)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!raw) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  const data = raw as unknown as ShortNoticeRow

  // Resolve a readable set name for display (falls back to the slug).
  let desiredSetName: string | null = null
  if (data.desired_set) {
    const { data: setRow } = await service.from('sets').select('name').eq('slug', data.desired_set).maybeSingle()
    desiredSetName = setRow?.name || data.desired_set
  }

  // Which card the charge would hit, in the form a human recognises. Non-fatal:
  // a Square hiccup must not stop the approval page from rendering, and the
  // charge re-resolves the card itself anyway.
  let cardLabel: string | null = null
  if (data.square_card_id) {
    try {
      const res = await square.cardsApi.retrieveCard(data.square_card_id)
      const c = res.result.card
      if (c) cardLabel = `${c.cardBrand ?? 'CARD'} ····${c.last4 ?? '????'}`
    } catch (e) {
      console.error('[short-notice] card lookup failed (non-fatal):', e)
    }
  }

  // ⚠️ What the request PRODUCED, so a reload of a resolved request can say what
  // actually happened. Without this the page assumed every resolved request was
  // the "unlocked, nothing charged" kind — so reopening the link after a real
  // $15 charge told the owner no money had moved. A page that misreports a
  // charge is worse than one that says nothing.
  let bookingStatus: string | null = null
  if (data.booking_id) {
    const { data: bk } = await service
      .from('bookings').select('status').eq('id', data.booking_id).maybeSingle()
    bookingStatus = bk?.status ?? null
  }

  return NextResponse.json({
    request: { ...data, desired_set_name: desiredSetName, card_label: cardLabel },
    chargeable: isChargeable(data),
    bookingStatus,
    grantMinutes: await grantMinutes(),
  })
}

// POST /api/short-notice/[token] — approve (charge / timed / until date) or deny.
// Token-gated (the owner's private approval link / admin list).
export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const body = await req.json().catch(() => ({} as any))
  const action = String(body.action || '')

  const { data: reqRaw } = await service
    .from('short_notice_requests')
    .select(REQ_COLS)
    .eq('approve_token', params.token)
    .maybeSingle()
  if (!reqRaw) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  const reqRow = reqRaw as unknown as ShortNoticeRow
  if (reqRow.status !== 'pending') return NextResponse.json({ error: `Already ${reqRow.status}.`, status: reqRow.status }, { status: 409 })

  if (action === 'deny') {
    const canned = DENY_REASONS[String(body.reason || '')] ?? ''
    const custom = typeof body.note === 'string' ? body.note.trim().slice(0, 300) : ''
    const { error: denyErr } = await service.from('short_notice_requests')
      .update({ status: 'denied', resolved_at: new Date().toISOString() }).eq('id', reqRow.id)
    if (denyErr) return NextResponse.json({ error: denyErr.message }, { status: 500 })

    // Tell them. Non-fatal — a failed text must not leave the row un-denied.
    const when = reqRow.desired_date
      ? `${reqRow.desired_date}${reqRow.desired_start != null ? ` at ${fmt12(Number(reqRow.desired_start))}` : ''}`
      : 'that time'
    const because = custom || canned
    const line = because
      ? `Sorry — we can’t do ${when}: ${because}.`
      : `Sorry — we can’t do ${when}.`

    await Promise.allSettled([
      reqRow.customer_phone
        ? sendSMS(reqRow.customer_phone, `${line}\n\nPick another time at ${APP_URL}/availability, or text us at (832) 408-1631 and we’ll find you one.`)
        : Promise.resolve(),
      reqRow.customer_email
        ? sendSimpleEmail({
            to: reqRow.customer_email,
            subject: 'About your short-notice request',
            heading: 'We couldn’t take that one',
            paragraphs: [
              line,
              'Pick another time and we’ll get you in — or text us at (832) 408-1631 and we’ll sort something out.',
            ],
            ctaText: 'See available times', ctaUrl: `${APP_URL}/availability`,
            label: 'short_notice_denied',
          })
        : Promise.resolve(),
    ])

    return NextResponse.json({ ok: true, status: 'denied', notified: !!(reqRow.customer_phone || reqRow.customer_email) })
  }

  // ── Approve AND take the money ────────────────────────────────────────────
  if (action === 'approve_charge') return approveAndCharge(reqRow)

  if (action !== 'approve_1h' && action !== 'approve_48h' && action !== 'approve_until') {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  // Timed window (the escape hatch): open short-notice booking for N minutes
  // only and let them book it themselves. This is what approval used to mean,
  // and it stays available for a comp, a price change, or second thoughts.
  const timed = action === 'approve_1h'
  const mins = timed ? await grantMinutes() : 0
  const expiresIso = timed ? new Date(Date.now() + mins * 60_000).toISOString() : null
  const until = timed
    ? null
    : (action === 'approve_48h'
        ? datePlusDays(2)
        : (typeof body.until === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.until) ? body.until : null))
  if (!timed && !until) return NextResponse.json({ error: 'A valid date is required' }, { status: 400 })

  // Merge into the customer's pricing_overrides (preserve any existing overrides).
  const custQ = service.from('customers').select('id, pricing_overrides, email')
  const { data: cust } = reqRow.customer_id
    ? await custQ.eq('id', reqRow.customer_id).maybeSingle()
    : await custQ.eq('email', reqRow.customer_email).maybeSingle()
  if (!cust) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  // Timed grant sets a precise expiry and clears any stale date; a date grant
  // sets the day and clears any stale timed expiry.
  // ⚠️ A TIMED approval is scoped to exactly what was asked for — that set, that
  // date, that start time. Without this the grant opened the whole window, so
  // "yes to Thursday 7pm" also said yes to Thursday 9am. The broader 48h/until
  // approvals are a deliberate wider grant, so they CLEAR the scope.
  const scope = (timed && reqRow.desired_set && reqRow.desired_date && reqRow.desired_start != null)
    ? { set: reqRow.desired_set, date: reqRow.desired_date, start: Number(reqRow.desired_start) }
    : null
  const overrides = {
    ...(cust.pricing_overrides || {}),
    short_notice: true,
    short_notice_until: timed ? null : until,
    short_notice_expires_at: timed ? expiresIso : null,
    short_notice_scope: scope,
  }
  const { error: upErr } = await service.from('customers').update({ pricing_overrides: overrides }).eq('id', cust.id)
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })

  await service.from('short_notice_requests').update({
    status: 'approved',
    granted_until: until,
    granted_expires_at: expiresIso,
    resolved_at: new Date().toISOString(),
  }).eq('id', reqRow.id)

  const bookUrl = `${APP_URL}/availability`
  // Houston-time clock label for when the timed window closes.
  const clock = timed
    ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(new Date(expiresIso!))
    : ''
  const timedLabel = timed ? `for the next ${mins} minutes — until ${clock}` : null

  // Notify the customer — non-fatal.
  await Promise.allSettled([
    sendShortNoticeApprovedEmail({ customerName: reqRow.customer_name || '', customerEmail: reqRow.customer_email, grantedUntil: until, timedLabel }),
    reqRow.customer_phone
      ? sendSMS(reqRow.customer_phone, timed
          ? `✅ Made Kulture: you're approved to book short-notice for the next ${mins} min (until ${clock}). Book now: ${bookUrl}`
          : `✅ Made Kulture: you're approved to book short-notice through ${until}. Book at ${bookUrl}`)
      : Promise.resolve(),
  ])

  return NextResponse.json({ ok: true, status: 'approved', outcome: 'unlocked', granted_until: until, granted_expires_at: expiresIso })
}

// ─── approve_charge ─────────────────────────────────────────────────────────
//
// One tap does the whole thing: re-price and re-check the slot, hold it, take
// the money, confirm, mint the door code and send the confirmation.
//
// The order of operations is the safety property. Rows go in as
// `pending_payment` FIRST so the slot is held while Square is thinking, and are
// only promoted to `confirmed` once the money is actually taken.
//
// ⚠️ THE DOOR CODE IS MINTED BY finalizeBooking, WHICH RUNS ONLY ON THE
// CONFIRMED PATH. igloohome algoPINs cannot be revoked — a code issued against
// an unpaid hold would keep working, and nothing in this codebase could kill it.
// If you ever move finalizeBooking earlier to "save a step", that is the bug.
async function approveAndCharge(reqRow: ShortNoticeRow) {
  if (!isChargeable(reqRow)) {
    return NextResponse.json({
      error: 'This request was sent before auto-pay existed — it has no agreed price or card. Use APPROVE WITHOUT CHARGING instead.',
    }, { status: 400 })
  }
  // Idempotency: a double-tap must never produce a second booking. (The pending
  // check above catches the normal case; this catches a row that was left
  // half-resolved by an earlier failure.)
  if (reqRow.booking_id) {
    return NextResponse.json({ error: 'This request already produced a booking.', bookingId: reqRow.booking_id }, { status: 409 })
  }

  const setSlug   = String(reqRow.desired_set)
  const date      = String(reqRow.desired_date)
  const startHour = Number(reqRow.desired_start)
  const hours     = Number(reqRow.desired_hours)
  const endHour   = startHour + hours
  const cents     = Number(reqRow.quoted_cents)
  const setName   = SLUG_TO_NAME[setSlug] ?? setSlug
  const startISO  = bookingHourToISO(date, startHour)

  // Consent is valid until the session STARTS — past that there is nothing left
  // to charge for, and a charge would be indefensible. This is the ONLY timer on
  // consent, by decision.
  if (Date.parse(startISO) <= Date.now()) {
    return NextResponse.json({
      error: `That session was due to start at ${fmt12(startHour)} on ${date} — it has already passed, so there is nothing to charge for. Deny it and ask them to request a new time.`,
    }, { status: 410 })
  }

  // Who is this, in Square's terms as well as ours.
  const custQ = service.from('customers').select('id, email, name, phone, pricing_overrides')
  const { data: cust } = reqRow.customer_id
    ? await custQ.eq('id', reqRow.customer_id).maybeSingle()
    : await custQ.eq('email', reqRow.customer_email).maybeSingle()
  if (!cust) return NextResponse.json({ error: 'Customer not found' }, { status: 404 })

  const email = String(cust.email || reqRow.customer_email).toLowerCase().trim()
  const name  = cust.name || reqRow.customer_name || 'Guest'
  const phone = cust.phone || reqRow.customer_phone || null

  let authUserId: string | null = null
  let squareCustomerId: string | null = null
  try {
    const { data: authUsers } = await service.auth.admin.listUsers()
    authUserId = authUsers?.users?.find((u: any) => u.email === email)?.id ?? null
    if (authUserId) {
      const { data: prof } = await service
        .from('customer_profiles').select('square_customer_id').eq('id', authUserId).maybeSingle()
      squareCustomerId = prof?.square_customer_id ?? null
    }
  } catch (e) {
    console.error('[approve_charge] auth/profile lookup failed (non-fatal):', e)
  }

  // ── Re-price and re-check the slot AT APPROVAL TIME ──────────────────────
  // Someone may have taken it between the ask and the answer. This must back
  // out cleanly and charge nothing — validateAndPriceOrder re-runs the same
  // availability, minimum-length and price checks checkout runs.
  const input: BookingCoreInput = {
    type: 'set', setSlug, date, startHour, endHour,
    sets: [{ setSlug, date, startHour, endHour }],
    equipment: [], guests: null,
    name, email, phone: phone || '',
    notes: reqRow.note || '',
    totalCents: cents,
  }
  const v = await validateAndPriceOrder(service, input, { isMember: true, allowShortNotice: true })
  if (!v.ok) {
    // A price mismatch here means a rate moved between the quote and now. Say so
    // plainly rather than silently charging either number — the quote is what
    // they agreed to, and the gap is a decision, not an error to paper over.
    return NextResponse.json({ error: v.error, outcome: 'unavailable' }, { status: v.status })
  }

  // ── Hold the slot BEFORE talking to Square ───────────────────────────────
  const ins = await insertBookingRows(service, v.order, {
    status:     'pending_payment',
    source:     'short-notice-autopay',
    customerId: cust.id,
    authUserId,
    notes:      reqRow.note || null,
    squareCardOnFileId: reqRow.square_card_id ?? null,
  })
  if (!ins.ok) return NextResponse.json({ error: ins.error }, { status: 500 })
  const { bookingIds, orderGroup } = ins

  const releaseHold = async () => {
    await service.from('bookings').update({ status: 'cancelled' })
      .in('id', bookingIds).eq('status', 'pending_payment')
  }

  // ── Charge the card they authorised ──────────────────────────────────────
  let paymentId: string | null = null
  let declineReason: string | null = null
  if (reqRow.square_card_id && squareCustomerId) {
    try {
      const { result } = await square.paymentsApi.createPayment({
        sourceId:       reqRow.square_card_id,
        // One charge per request, even if the approve link is tapped twice.
        idempotencyKey: reqRow.id,
        amountMoney:    { amount: BigInt(cents), currency: 'USD' },
        customerId:     squareCustomerId,
        locationId:     process.env.SQUARE_LOCATION_ID!,
        note:           `Made Kulture — short notice ${setName} ${date} ${fmt12(startHour)}–${fmt12(endHour)}`,
        buyerEmailAddress: email,
      })
      paymentId = result.payment?.id ?? null
    } catch (e: any) {
      declineReason = e?.errors?.[0]?.detail || e?.message || 'Card was declined.'
      console.error('[approve_charge] charge failed:', declineReason)
    }
  } else {
    declineReason = reqRow.square_card_id ? 'No Square customer on file for this card.' : 'No card on file.'
  }

  // ── Paid: confirm, finalize, done ────────────────────────────────────────
  if (paymentId) {
    // Written as a CLAIM on pending_payment so a concurrent sweep can't leave
    // this reporting success over rows it no longer owns. `.select()` is what
    // proves the write landed — supabase-js does not throw, and an update that
    // matches zero rows comes back error:null.
    const { data: confirmed, error: confErr } = await service
      .from('bookings')
      .update({ status: 'confirmed', square_payment_id: paymentId })
      .in('id', bookingIds).eq('status', 'pending_payment')
      .select('id')

    if (confErr || !confirmed?.length) {
      console.error('[approve_charge] CRITICAL: charged but confirm failed', confErr)
      await sendOwnerPush({
        title: '⚠️ Short-notice charged but NOT confirmed',
        body: `${name} was charged $${dollars(cents)} (${paymentId}) but the booking did not confirm — fix by hand.`,
        url: '/admin/dashboard',
      }).catch(() => {})
      return NextResponse.json({
        error: `The card was charged $${dollars(cents)} (payment ${paymentId}) but the booking did not confirm. Nothing was sent to the customer and NO door code was issued — fix this one by hand.`,
      }, { status: 500 })
    }

    await service.from('short_notice_requests').update({
      status: 'approved', booking_id: bookingIds[0], resolved_at: new Date().toISOString(),
    }).eq('id', reqRow.id)

    // Door code + calendar + the confirmation that states the amount.
    let doorCode: string | null = null
    try {
      const r = await finalizeBooking(service, bookingIds)
      doorCode = r.doorCode
    } catch (e) {
      console.error('[approve_charge] finalize error (non-fatal):', e)
    }

    return NextResponse.json({
      ok: true, status: 'approved', outcome: 'charged',
      amount: dollars(cents), bookingId: bookingIds[0], doorCode,
      setName, date, startHour, endHour,
    })
  }

  // ── Declined or no card: hold the slot and send a link ───────────────────
  // Reuses the delegated-payment machinery wholesale — /pay/[token] already
  // charges, confirms, finalizes and receipts, and the payment-holds cron
  // already releases the slot when the timer runs out. A second, parallel
  // "unpaid link" system would be two things to keep correct instead of one.
  const payToken  = randomUUID()
  const expiresAt = holdExpiryFor(startISO)
  const payerPhone = phone ? toE164(phone) : null
  const channel: 'sms' | 'email' = payerPhone ? 'sms' : 'email'
  const payerContact = payerPhone ?? email

  const { error: delErr } = await service.from('payment_delegations').insert({
    order_group:   orderGroup,
    booking_ids:   bookingIds,
    payer_name:    name,
    payer_contact: payerContact,
    channel,
    amount_cents:  cents,
    status:        'pending',
    pay_token:     payToken,
    booker_name:   name,
    booker_email:  email,
    // ⚠️ booker and payer are the SAME person here. /api/pay/[token] reads that
    // equality to switch the pay page into self-pay wording — without it the
    // member is told someone asked them to cover their own booking.
    booker_phone:  payerPhone,
    expires_at:    expiresAt,
  })
  if (delErr) {
    console.error('[approve_charge] delegation insert failed:', delErr)
    await releaseHold()
    return NextResponse.json({
      error: `The card didn't go through (${declineReason}) and the payment link could not be created either — the slot has been released. Nothing was charged.`,
    }, { status: 500 })
  }

  await service.from('short_notice_requests').update({
    status: 'approved', booking_id: bookingIds[0],
    hold_expires_at: expiresAt, resolved_at: new Date().toISOString(),
  }).eq('id', reqRow.id)

  const payUrl = `${APP_URL}/pay/${payToken}`
  const minsHeld = Math.max(1, Math.round((Date.parse(expiresAt) - Date.now()) / 60000))
  const sched = `${setName} — ${date} ${fmt12(startHour)}–${fmt12(endHour)}`
  try {
    if (channel === 'sms') {
      await sendSMS(payerContact,
        `✅ Made Kulture: your short-notice session is approved!\n${sched}\n$${dollars(cents)}\n\nWe couldn't charge your card on file, so finish here to lock it in — held ${minsHeld} min: ${payUrl}\nReply STOP to opt out.`)
    } else {
      await sendSimpleEmail({
        to: email,
        subject: `Approved — finish your Made Kulture booking ($${dollars(cents)})`,
        heading: 'Your short-notice session is approved',
        paragraphs: [
          `<strong style="color:#fff;">${sched}</strong>`,
          `Amount: <strong style="color:#fff;">$${dollars(cents)}</strong>`,
          `We weren't able to charge your card on file, so the slot is held for <strong style="color:#fff;">${minsHeld} minutes</strong> while you complete payment.`,
        ],
        ctaText: 'Pay & confirm', ctaUrl: payUrl, label: 'short_notice_pay_link',
      })
    }
  } catch (e) {
    console.error('[approve_charge] pay link send failed:', e)
  }

  return NextResponse.json({
    ok: true, status: 'approved', outcome: 'held',
    amount: dollars(cents), bookingId: bookingIds[0],
    holdExpiresAt: expiresAt, minsHeld, declineReason, payUrl,
    setName, date, startHour, endHour, channel,
  })
}
