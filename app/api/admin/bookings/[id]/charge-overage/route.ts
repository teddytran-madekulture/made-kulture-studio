import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { Client, Environment } from 'square'
import { createClient } from '@supabase/supabase-js'
import { sendSMSResult } from '@/lib/sms'
import { sendOwnerPush } from '@/lib/push'
import { randomUUID } from 'crypto'

const square = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN!,
  environment: process.env.SQUARE_ENVIRONMENT === 'production'
    ? Environment.Production : Environment.Sandbox,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/admin/bookings/[id]/charge-overage
//   { extraGuests, hours?, mode?: 'fee' | 'penalty', sendSms? }
//
// Charge for more people than the booking declared. TWO different things, which
// this route used to conflate into one:
//
//   mode 'fee'      extraGuests × per_person_fee × HOURS
//                   The legitimate charge, and exactly what checkout would have
//                   billed — `booking-core` prices extra guests per window as
//                   `over × perPersonFee × hours`. Use it when the group simply
//                   grew for part of the session. No warning flag.
//
//   mode 'penalty'  extraGuests × guest_penalty_per_head  (flat, ignores hours)
//                   Punitive, for someone who turned up with undeclared people.
//                   Writes a `warning` note that follows the customer.
//
// ⚠️ WHY THE HOURS MATTER: headcount is declared ONCE for a whole booking, but a
// group can be 3 people for three hours and 8 for one. Without an hours field the
// only available charge was the flat $50/head penalty across the entire booking —
// so an honest customer whose group grew for one hour got punished as if they'd
// lied, at several times the correct amount.
//
// Defaults keep old callers working: no mode = 'penalty', which is the previous
// behaviour exactly.

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { extraGuests, hours, mode, sendSms } = await req.json()
    const extra = Math.floor(Number(extraGuests) || 0)
    if (extra <= 0) return NextResponse.json({ error: 'Enter how many guests over the limit.' }, { status: 400 })

    const isFee = mode === 'fee'
    // Half-hours are real here — the studio books in 30-minute increments.
    const billedHours = isFee ? Math.round((Number(hours) || 0) * 2) / 2 : 0
    if (isFee && !(billedHours > 0)) {
      return NextResponse.json({ error: 'Enter how many hours the extra guests were on site.' }, { status: 400 })
    }

    const { data: booking } = await supabase
      .from('bookings')
      .select(`
        id, start_time, guest_count, total_amount, square_card_on_file_id, customer_id,
        customers ( id, name, email, phone, square_customer_id )
      `)
      .eq('id', params.id)
      .single()

    if (!booking) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })

    const customer = booking.customers as any
    const cardId = booking.square_card_on_file_id as string | null
    const squareCustomerId = customer?.square_customer_id as string | null

    if (!cardId || !squareCustomerId) {
      return NextResponse.json({ error: 'No card on file for this booking — can’t auto-charge.' }, { status: 400 })
    }

    // ── Rates ────────────────────────────────────────────────────────────────
    const { data: settingRows } = await supabase
      .from('studio_settings').select('key, value')
      .in('key', ['guest_penalty_per_head', 'per_person_fee'])
    const settings: Record<string, string> = {}
    for (const r of settingRows ?? []) settings[r.key] = r.value

    const penaltyPerHead = Number(settings['guest_penalty_per_head']) || 50
    const perPersonFee   = Number(settings['per_person_fee'])         || 10

    const amount = isFee
      ? Math.round(extra * perPersonFee * billedHours * 100) / 100
      : Math.round(extra * penaltyPerHead * 100) / 100

    if (!(amount > 0)) return NextResponse.json({ error: 'That works out to $0 — nothing to charge.' }, { status: 400 })

    const note = isFee
      ? `Extra guests — ${extra} × $${perPersonFee}/hr × ${billedHours}hr`
      : `Guest overage — ${extra} over the ${booking.guest_count ?? '?'}-person booking`

    // ── Charge ───────────────────────────────────────────────────────────────
    const { result } = await square.paymentsApi.createPayment({
      sourceId:          cardId,
      idempotencyKey:    randomUUID(),
      amountMoney:       { amount: BigInt(Math.round(amount * 100)), currency: 'USD' },
      customerId:        squareCustomerId,
      locationId:        process.env.SQUARE_LOCATION_ID!,
      note:              `Made Kulture — ${note}`,
      buyerEmailAddress: customer?.email || undefined,
    })
    const squarePaymentId = result.payment!.id!

    // ── Reflect it on the booking total ──────────────────────────────────────
    // ⚠️ This route NEVER used to do this at all — it took the money and the
    // booking still showed the old price, so the record understated what the
    // customer had paid. Increment, verify with .select(), shout if it misses:
    // supabase-js does not throw, and an RLS-blocked update returns error:null
    // having matched zero rows.
    const bumped = Math.round(((Number(booking.total_amount) || 0) + amount) * 100) / 100
    let totalWarning: string | null = null
    const { data: upRows, error: upErr } = await supabase
      .from('bookings').update({ total_amount: bumped }).eq('id', booking.id).select('id')

    if (upErr || !upRows?.length) {
      console.error('[charge-overage] CRITICAL: charged but total_amount not updated', upErr)
      totalWarning = `Card charged $${amount.toFixed(2)} (${squarePaymentId}) but the booking total did not update — fix it by hand.`
      await sendOwnerPush({
        title: '⚠️ Charged, total not updated',
        body:  `$${amount.toFixed(2)} guest charge on booking ${booking.id} but total_amount didn't move. Payment ${squarePaymentId}.`,
        url:   '/admin/dashboard',
      }).catch(() => {})
    }

    // ── Customer note ────────────────────────────────────────────────────────
    // ⚠️ Tag matters. A `warning` note follows the customer and flags them on
    // future bookings — appropriate for someone who brought undeclared people,
    // NOT for a group that legitimately grew for an hour and paid the fee.
    if (booking.customer_id) {
      const dateLabel = new Date(booking.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      await supabase.from('customer_notes').insert({
        customer_id: booking.customer_id,
        tag:         isFee ? 'note' : 'warning',
        note: isFee
          ? `Charged $${amount.toFixed(2)} for ${extra} extra guest(s) for ${billedHours}hr on the ${dateLabel} booking (standard $${perPersonFee}/person/hr rate).`
          : `Brought ${extra} guest(s) over the declared ${booking.guest_count ?? '?'}-person limit on ${dateLabel}. Charged $${amount.toFixed(2)} overage to card on file.`,
      })
    }

    // ── Optional SMS ─────────────────────────────────────────────────────────
    let smsError: string | null = null
    if (sendSms && customer?.phone) {
      const msg = isFee
        ? `Made Kulture: $${amount.toFixed(2)} was charged to your card on file for ${extra} extra guest(s) for ${billedHours} hour(s). Questions? Text (832) 408-1631.`
        : `Made Kulture: $${amount.toFixed(2)} was charged to your card on file for ${extra} guest(s) over your booking's limit. Questions? Text (832) 408-1631.`
      const r = await sendSMSResult(customer.phone, msg)
      if (!r.ok) smsError = r.error ?? 'SMS failed to send'
    }

    return NextResponse.json({ success: true, amount, mode: isFee ? 'fee' : 'penalty', squarePaymentId, smsError, totalWarning })
  } catch (err: any) {
    console.error('[charge-overage] error:', err)
    const msg = err?.errors?.[0]?.detail || err?.message || 'Overage charge failed.'
    return NextResponse.json({ error: msg }, { status: 400 })
  }
}
