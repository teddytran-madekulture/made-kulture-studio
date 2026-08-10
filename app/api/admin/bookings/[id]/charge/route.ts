import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { Client, Environment } from 'square'
import { createClient } from '@supabase/supabase-js'
import { sendSMSResult } from '@/lib/sms'
import { sendOwnerPush } from '@/lib/push'
import { randomUUID } from 'crypto'

const square = new Client({
  accessToken:  process.env.SQUARE_ACCESS_TOKEN!,
  environment:  process.env.SQUARE_ENVIRONMENT === 'production'
    ? Environment.Production : Environment.Sandbox,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/admin/bookings/[id]/charge
// Charges a saved Square card for the booking difference and updates the total
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    squareCardId,
    squareCustomerId,
    amount,         // dollars — the difference to charge
    description,
    phone,
    customerName,
    email,
    sendSms,
    // ⚠️ `newTotal` is deliberately NO LONGER read. It used to be an ABSOLUTE
    // total computed in the browser from a hardcoded set-rate map, and writing it
    // here overwrote the recorded price — silently dropping equipment add-ons,
    // one-off fees and past overtime off any booking charged for extra time.
    // The total now moves by exactly what Square accepted, computed server-side.
  } = await req.json()

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
  }
  if (!squareCardId || !squareCustomerId) {
    return NextResponse.json({ error: 'Card on file required' }, { status: 400 })
  }

  try {
    const { result } = await square.paymentsApi.createPayment({
      sourceId:          squareCardId,
      idempotencyKey:    randomUUID(),
      amountMoney:       { amount: BigInt(Math.round(amount * 100)), currency: 'USD' },
      customerId:        squareCustomerId,
      locationId:        process.env.SQUARE_LOCATION_ID!,
      note:              description || 'Made Kulture — Booking adjustment',
      buyerEmailAddress: email || undefined,
    })

    const squarePaymentId = result.payment!.id!

    // ── Reflect the charge on the booking total ──────────────────────────────
    // Increment, never assign: whatever else is on this booking stays on it.
    // The money is already gone, so a failure here is reported loudly rather
    // than swallowed — supabase-js does NOT throw on a Postgres error, and an
    // RLS-blocked update returns error:null with zero rows matched, so the
    // .select() is what actually proves the write landed.
    const charged = Math.round(Number(amount) * 100) / 100
    const { data: bk } = await supabase
      .from('bookings').select('total_amount').eq('id', params.id).maybeSingle()

    let totalWarning: string | null = null
    if (bk) {
      const bumped = Math.round(((Number(bk.total_amount) || 0) + charged) * 100) / 100
      const { data: upRows, error: upErr } = await supabase
        .from('bookings').update({ total_amount: bumped }).eq('id', params.id).select('id')
      if (upErr || !upRows?.length) {
        console.error('[charge] CRITICAL: charged but total_amount not updated', upErr)
        totalWarning = `Card charged $${charged.toFixed(2)} (${squarePaymentId}) but the booking total did not update — fix it by hand.`
        await sendOwnerPush({
          title: '⚠️ Charged, total not updated',
          body:  `$${charged.toFixed(2)} taken on booking ${params.id} but total_amount didn't move. Payment ${squarePaymentId}.`,
          url:   '/admin/dashboard',
        }).catch(() => {})
      }
    }

    // SMS confirmation
    let smsError: string | null = null
    if (sendSms && phone) {
      const r = await sendSMSResult(phone, `Made Kulture: Hi ${customerName}, we've charged $${Number(amount).toFixed(2)} to your card on file for your booking update. Questions? Text (832) 408-1631.`)
      if (!r.ok) smsError = r.error ?? 'SMS failed to send'
    }

    return NextResponse.json({ success: true, squarePaymentId, smsError, totalWarning })
  } catch (err: any) {
    console.error('Charge error:', err)
    const msg = (err as any)?.errors?.[0]?.detail || (err as any)?.message || 'Payment failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}