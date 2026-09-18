import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { Client, Environment } from 'square'
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'crypto'
import { refundPayment } from '@/lib/square-refund'
import { notifyDelegatedRefund } from '@/lib/refund-notify'
import { issueCredit } from '@/lib/credits'
import { findOrCreateSquareCustomer } from '@/lib/square-customer'
import { sendSMSResult } from '@/lib/sms'
import { sendSimpleEmail } from '@/lib/email'
import { sendOwnerPush } from '@/lib/push'

// /api/admin/bookings/[id]/guests
//
// CHANGE THE PARTY SIZE ON AN EXISTING BOOKING, and move the money the change
// is worth. Before this the guest count was write-once at checkout: a customer
// who booked 7 and brought 6 had overpaid a guest fee with no way to put it
// right short of a hand-rolled Square refund and a SQL edit.
//
//   GET  ?guests=N  → a QUOTE. No money, no writes. The modal calls this on
//                     every keystroke so the arithmetic the admin reads is the
//                     server's, not a second copy of it in the browser.
//   POST            → apply it. Down = refund or studio credit; up = charge.
//
// ⚠️ THE DIFFERENCE IS COMPUTED FROM BOTH COUNTS WITH THE SAME FORMULA, never
// from the stored guest_fee_amount. This is the editDiff lesson from 2026-08-10:
// compare like with like and an untouched booking cancels to exactly $0. The
// stored fee is still READ — but only to WARN when it disagrees, which is what a
// multi-window booking looks like (the whole booking's guest fee is banked on
// the first row, so that row's own hours can't reproduce it).
//
// ⚠️ Money moves BEFORE the row is written, and the write is verified with
// .select(). A refund that succeeds against a booking whose total never moved is
// the silent-failure pattern with real dollars in it, so that case pushes.

const square = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN!,
  environment: process.env.SQUARE_ENVIRONMENT === 'production'
    ? Environment.Production : Environment.Sandbox,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const BOOKING_SELECT = `id, start_time, end_time, set_id, guest_count, guest_fee_amount,
  total_amount, square_payment_id, square_card_on_file_id, auth_user_id, customer_id,
  status, sets ( name ),
  customers ( id, name, email, phone, square_customer_id )`

type Quote = {
  current: number
  proposed: number
  isBuyout: boolean
  hours: number
  capacity: number
  maxPerSet: number
  perPersonFee: number
  oldFee: number
  newFee: number
  delta: number            // + = owed to us, − = owed back to them
  storedFee: number
  storedMismatch: boolean
  total: number
  canRefund: boolean
  canCredit: boolean
  refundCeiling: number
  error?: string
}

// The ONE guest-fee formula, matching lib/booking-core.ts: only the heads OVER
// capacity are billable, and they are billed per hour. A buyout carries no
// per-person fee at all — its 30-head limit is a cap, not a price.
function feeFor(guests: number, isBuyout: boolean, capacity: number, perPersonFee: number, hours: number) {
  if (isBuyout) return 0
  const over = Math.max(0, guests - capacity)
  return Math.round(over * perPersonFee * hours * 100) / 100
}

async function loadSettings() {
  const { data } = await supabase
    .from('studio_settings')
    .select('key, value')
    .in('key', ['guest_capacity_per_set', 'per_person_fee', 'max_guests_per_set'])
  const map: Record<string, any> = {}
  for (const r of data ?? []) map[r.key] = r.value
  return {
    capacity:     Number(map['guest_capacity_per_set']) || 5,
    perPersonFee: Number(map['per_person_fee']) || 10,
    maxPerSet:    Number(map['max_guests_per_set']) || 7,
  }
}

async function quote(bookingId: string, proposedRaw: unknown): Promise<{ booking: any; q: Quote } | { error: string; status: number }> {
  const { data: booking } = await supabase.from('bookings').select(BOOKING_SELECT).eq('id', bookingId).maybeSingle()
  if (!booking) return { error: 'Booking not found.', status: 404 }

  const { capacity, perPersonFee, maxPerSet } = await loadSettings()

  const isBuyout = !booking.set_id
  const ms = new Date(booking.end_time).getTime() - new Date(booking.start_time).getTime()
  const hours = Math.round((ms / 3_600_000) * 100) / 100

  const current  = Math.max(0, Math.floor(Number(booking.guest_count) || 0))
  const proposed = Math.max(0, Math.floor(Number(proposedRaw) || 0))

  const oldFee = feeFor(current, isBuyout, capacity, perPersonFee, hours)
  const newFee = feeFor(proposed, isBuyout, capacity, perPersonFee, hours)
  const delta  = Math.round((newFee - oldFee) * 100) / 100

  const storedFee = Math.round((Number(booking.guest_fee_amount) || 0) * 100) / 100
  const total     = Math.round((Number(booking.total_amount) || 0) * 100) / 100

  let error: string | undefined
  const ceiling = isBuyout ? 30 : maxPerSet
  if (proposed < 1) error = 'A booking needs at least one person.'
  else if (proposed > ceiling) {
    error = isBuyout
      ? `A full buyout tops out at 30 people.`
      : `${proposed} is over the ${ceiling}-per-set limit — they would need another set.`
  }

  return {
    booking,
    q: {
      current, proposed, isBuyout, hours, capacity, maxPerSet, perPersonFee,
      oldFee, newFee, delta, storedFee,
      // A stored fee that its own row can no longer reproduce means the fee was
      // banked across several windows. The delta is still right; the ROW's fee
      // field will be, after this, a number that only describes this row.
      storedMismatch: Math.abs(storedFee - oldFee) > 0.005,
      total,
      canRefund: !!booking.square_payment_id,
      canCredit: !!booking.auth_user_id,
      refundCeiling: total,
      error,
    },
  }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const raw = req.nextUrl.searchParams.get('guests')
  const r = await quote(params.id, raw)
  if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })
  return NextResponse.json({ ...r.q, setName: (r.booking.sets as any)?.name ?? null })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const body = await req.json()
    const {
      guests,            // the new party size
      mode,              // 'refund' | 'credit' | 'charge' | 'none'
      reason,            // optional free text, ends up on the Square refund + the note
      sourceId,          // keyed-in card nonce (charge only)
      saveCard,
      squareCardId,      // a chosen saved card (charge only)
      squareCustomerId,
      notify,            // text + email the customer (default true)
      // <AdminCardCharge> renders its OWN notify checkbox and posts it as
      // `sendSms`. That checkbox is the one the admin is looking at on the
      // keyed-card screen, so it wins over the value the modal set on mount.
      sendSms,
    } = body

    const r = await quote(params.id, guests)
    if ('error' in r) return NextResponse.json({ error: r.error }, { status: r.status })
    const { booking, q } = r
    if (q.error) return NextResponse.json({ error: q.error }, { status: 400 })
    if (q.proposed === q.current) return NextResponse.json({ error: 'That is already the party size on this booking.' }, { status: 400 })

    const customer   = booking.customers as any
    const setLabel   = (booking.sets as any)?.name || 'the full studio'
    const dateLabel  = new Date(booking.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    const owed       = Math.abs(q.delta)
    const owedCents  = Math.round(owed * 100)
    const appUrl     = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')

    // ── Decide what the chosen mode is allowed to do ─────────────────────────
    let effectiveMode: 'refund' | 'credit' | 'charge' | 'none' = 'none'
    if (q.delta < 0) {
      if (mode !== 'refund' && mode !== 'credit' && mode !== 'none') {
        return NextResponse.json({ error: 'Fewer guests means money goes back — choose refund or studio credit.' }, { status: 400 })
      }
      effectiveMode = mode
      if (effectiveMode === 'refund' && !q.canRefund) {
        return NextResponse.json({ error: 'No Square payment on file for this booking — issue credit instead, or refund in Square directly.' }, { status: 400 })
      }
      if (effectiveMode === 'refund' && owed > q.refundCeiling) {
        return NextResponse.json({ error: `The refund ($${owed.toFixed(2)}) is more than the booking total ($${q.refundCeiling.toFixed(2)}).` }, { status: 400 })
      }
      if (effectiveMode === 'credit' && !q.canCredit) {
        return NextResponse.json({ error: 'This booking has no account attached, so credit can’t be stored. Refund instead, or have them create an account.' }, { status: 400 })
      }
    } else if (q.delta > 0) {
      if (mode !== 'charge' && mode !== 'none') {
        return NextResponse.json({ error: 'More guests means money is owed — charge a card, or apply the change without charging.' }, { status: 400 })
      }
      effectiveMode = mode
    }

    // ── Move the money FIRST. Nothing is written if this fails. ──────────────
    let moneyNote = ''
    let squareRef: string | null = null
    let savedCardId: string | null = null

    if (effectiveMode === 'refund') {
      const refund = await refundPayment({
        paymentId: booking.square_payment_id,
        amountCents: owedCents,
        reason: reason || `Made Kulture — party size ${q.current} → ${q.proposed}`,
      })
      squareRef = refund.id ?? null
      moneyNote = `refunded $${owed.toFixed(2)}`
      await notifyDelegatedRefund(params.id, owedCents).catch(() => {})
    } else if (effectiveMode === 'credit') {
      const c = await issueCredit(booking.auth_user_id, owedCents, {
        kind: 'issued',
        reason: `Party size ${q.current} → ${q.proposed} on the ${dateLabel} booking`,
        bookingId: params.id,
        createdBy: 'admin',
      })
      if (!c.ok) return NextResponse.json({ error: c.error || 'Could not add credit.' }, { status: 400 })
      moneyNote = `$${owed.toFixed(2)} added as studio credit`
    } else if (effectiveMode === 'charge') {
      // Same resolution order as /add-charge: keyed nonce → chosen saved card →
      // the booking's card on file.
      let chargeSource: string | null = null
      let chargeCustomerId: string | undefined

      if (sourceId) {
        if (saveCard && booking.customer_id) {
          const { data: cust } = await supabase
            .from('customers').select('id, name, email, phone, square_customer_id')
            .eq('id', booking.customer_id).maybeSingle()
          if (cust) {
            let sqCustId: string | null = cust.square_customer_id ?? null
            if (!sqCustId) {
              sqCustId = await findOrCreateSquareCustomer(square, { email: cust.email, name: cust.name, phone: cust.phone })
              if (sqCustId) await supabase.from('customers').update({ square_customer_id: sqCustId }).eq('id', cust.id)
            }
            if (sqCustId) {
              const cardRes = await square.cardsApi.createCard({
                idempotencyKey: randomUUID(), sourceId, card: { customerId: sqCustId },
              })
              savedCardId = cardRes.result.card?.id ?? null
              if (savedCardId) {
                chargeSource = savedCardId
                chargeCustomerId = sqCustId
                await supabase.from('customers').update({ square_card_id: savedCardId }).eq('id', cust.id)
                await supabase.from('bookings').update({ square_card_on_file_id: savedCardId }).eq('id', booking.id)
              }
            }
          }
        }
        if (!chargeSource) chargeSource = sourceId
      } else if (squareCardId && squareCustomerId) {
        chargeSource = squareCardId
        chargeCustomerId = squareCustomerId
      } else if (booking.square_card_on_file_id && customer?.square_customer_id) {
        chargeSource = booking.square_card_on_file_id
        chargeCustomerId = customer.square_customer_id
      }

      if (!chargeSource) {
        return NextResponse.json({ error: 'No card on file for this booking — key a card in.' }, { status: 400 })
      }

      const { result } = await square.paymentsApi.createPayment({
        sourceId:          chargeSource,
        idempotencyKey:    randomUUID(),
        amountMoney:       { amount: BigInt(owedCents), currency: 'USD' },
        ...(chargeCustomerId ? { customerId: chargeCustomerId } : {}),
        locationId:        process.env.SQUARE_LOCATION_ID!,
        note:              `Made Kulture — extra guests (${q.current} → ${q.proposed})`.slice(0, 500),
        buyerEmailAddress: customer?.email || undefined,
      })
      squareRef = result.payment?.id ?? null
      moneyNote = `charged $${owed.toFixed(2)}`
    }

    // ── Now the row. Verified, because the money has already moved. ──────────
    //
    // total_amount is INCREMENTED by the delta, never reassigned — it carries
    // equipment, fees and past overtime that this route knows nothing about.
    const newTotal = Math.round((q.total + q.delta) * 100) / 100
    let warning: string | null = null

    const { data: upRows, error: upErr } = await supabase
      .from('bookings')
      .update({
        guest_count:      q.proposed,
        guest_fee_amount: q.newFee,
        total_amount:     Math.max(0, newTotal),
      })
      .eq('id', booking.id)
      .select('id, guest_count, total_amount')

    if (upErr || !upRows?.length) {
      console.error('[guests] CRITICAL: money moved but booking row did not update', upErr)
      warning = effectiveMode === 'none'
        ? 'The booking row did not update — try again.'
        : `The money moved (${moneyNote}${squareRef ? `, ${squareRef}` : ''}) but the booking still shows ${q.current} guests and the old total. Fix it by hand.`
      if (effectiveMode !== 'none') {
        await sendOwnerPush({
          title: '⚠️ Guest change: money moved, booking didn’t',
          body:  `${customer?.name || 'A customer'} — ${moneyNote} but booking ${booking.id} still reads ${q.current} guests.`,
          url:   '/admin/dashboard',
        }).catch(() => {})
      }
    }

    // ── Leave a trail on the booking itself (non-fatal). ────────────────────
    // booking_add_ons is where money on a booking is itemised, so the adjustment
    // lands there too — negative for a refund or credit. If the column refuses a
    // negative it is logged and nothing else breaks; the money has already moved
    // and an accounting line is not worth failing the request over.
    if (q.delta !== 0 && effectiveMode !== 'none') {
      const { error: addOnErr } = await supabase.from('booking_add_ons').insert({
        booking_id:   booking.id,
        equipment_id: null,
        quantity:     1,
        rate:         q.delta,
        paid:         true,
        label:        `Party size ${q.current} → ${q.proposed} · ${moneyNote}`,
      })
      if (addOnErr) console.error('[guests] add_ons line failed (non-fatal)', addOnErr)
    }

    if (booking.customer_id) {
      await supabase.from('customer_notes').insert({
        customer_id: booking.customer_id,
        tag:         'note',
        note:        `Party size changed ${q.current} → ${q.proposed} on the ${dateLabel} booking${moneyNote ? ` — ${moneyNote}` : ' (no price change)'}.`,
      }).then(({ error }) => { if (error) console.error('[guests] customer note failed', error) })
    }

    // ── Tell the customer ───────────────────────────────────────────────────
    let smsError: string | null = null
    const wantNotify = sendSms !== undefined ? sendSms !== false : notify !== false
    if (wantNotify && customer?.phone) {
      const line = effectiveMode === 'refund'
        ? `We've updated your ${dateLabel} booking to ${q.proposed} ${q.proposed === 1 ? 'person' : 'people'} and refunded $${owed.toFixed(2)} to your card. It can take a few business days to land.`
        : effectiveMode === 'credit'
        ? `We've updated your ${dateLabel} booking to ${q.proposed} ${q.proposed === 1 ? 'person' : 'people'} and added $${owed.toFixed(2)} to your account as studio credit. It never expires.`
        : effectiveMode === 'charge'
        ? `We've updated your ${dateLabel} booking to ${q.proposed} ${q.proposed === 1 ? 'person' : 'people'} and charged $${owed.toFixed(2)} for the extra ${q.proposed - q.current === 1 ? 'guest' : 'guests'}.`
        : `We've updated your ${dateLabel} booking to ${q.proposed} ${q.proposed === 1 ? 'person' : 'people'}. No change to your total.`
      // ⚠️ GSM-7 only in here — one curly quote or dash doubles every segment.
      const res = await sendSMSResult(customer.phone, `Made Kulture: ${line} Questions? Text (832) 408-1631.`)
      if (!res.ok) smsError = res.error ?? 'SMS failed to send'
    }
    if (wantNotify && customer?.email) {
      await sendSimpleEmail({
        to: customer.email,
        subject: `Your Made Kulture booking is now ${q.proposed} ${q.proposed === 1 ? 'person' : 'people'}`,
        heading: 'Party size updated',
        paragraphs: [
          `Your ${setLabel} booking on <strong style="color:#fff;">${dateLabel}</strong> is now set for <strong style="color:#fff;">${q.proposed} ${q.proposed === 1 ? 'person' : 'people'}</strong>.`,
          effectiveMode === 'refund'
            ? `We've refunded <strong style="color:#fff;">$${owed.toFixed(2)}</strong> to the card you paid with. Refunds usually take a few business days to appear.`
            : effectiveMode === 'credit'
            ? `We've added <strong style="color:#fff;">$${owed.toFixed(2)}</strong> to your account as studio credit. It never expires and applies automatically at your next booking.`
            : effectiveMode === 'charge'
            ? `We've charged <strong style="color:#fff;">$${owed.toFixed(2)}</strong> for the extra ${q.proposed - q.current === 1 ? 'guest' : 'guests'}.`
            : `There's no change to your total.`,
          `Your new booking total is <strong style="color:#fff;">$${Math.max(0, newTotal).toFixed(2)}</strong>.`,
        ],
        ctaText: 'View your booking', ctaUrl: `${appUrl}/account/bookings`, label: 'guest_count_changed',
      }).catch(e => console.error('[guests] email failed (non-fatal)', e))
    }

    return NextResponse.json({
      success: true,
      guests: q.proposed,
      delta: q.delta,
      newTotal: Math.max(0, newTotal),
      mode: effectiveMode,
      squareRef,
      // <AdminCardCharge> looks for this exact key on a successful charge.
      squarePaymentId: squareRef,
      cardSaved: !!savedCardId,
      smsError,
      warning,
    })
  } catch (err: any) {
    console.error('[guests] error:', err)
    const msg = err?.errors?.[0]?.detail || err?.message || 'Could not change the party size.'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
