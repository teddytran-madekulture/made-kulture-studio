import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { Client, Environment } from 'square'
import { createClient } from '@supabase/supabase-js'
import { sendSMSResult } from '@/lib/sms'
import { randomUUID } from 'crypto'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

interface ChargeLine {
  label: string
  amount: number
  equipmentId?: string | null
  unitRate?: number | null
  quantity?: number | null
}

const square = new Client({
  accessToken:  process.env.SQUARE_ACCESS_TOKEN!,
  environment:  process.env.SQUARE_ENVIRONMENT === 'production'
    ? Environment.Production : Environment.Sandbox,
})

// POST /api/admin/bookings/[id]/payment-link
// Creates a Square payment link for the booking difference and optionally SMS it
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { amount, description, phone, customerName, sendSms, lines } = await req.json()

  if (!amount || amount <= 0) {
    return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })
  }

  try {
    const { result } = await square.checkoutApi.createPaymentLink({
      idempotencyKey: randomUUID(),
      quickPay: {
        name:       description || 'Made Kulture — Booking Adjustment',
        priceMoney: { amount: BigInt(Math.round(amount * 100)), currency: 'USD' },
        locationId: process.env.SQUARE_LOCATION_ID!,
      },
    })

    const url = result.paymentLink?.url
    if (!url) throw new Error('Square did not return a payment link URL')

    // ── Record the lines so the payment can be RECONCILED when they pay ──────
    //
    // This used to mint a link and record nothing: the customer paid, the money
    // landed in Square, and the app never found out. Storing the order id
    // against unpaid booking_add_ons rows means the EXISTING Square webhook
    // (app/api/webhooks/square) flips them to paid and bumps the booking total
    // on its own — same machinery the customer-facing add-gear flow already
    // uses. No new table, no new handler.
    //
    // rate is per-unit, matching add-charge: equipment stores its unit rate, a
    // free-form line stores its flat amount as the rate with quantity 1.
    const orderId = result.paymentLink?.orderId ?? null
    // ⚠️ Keep the LINK id too, not just the order id. Square payment links have
    // NO expiry — "the link will be active as long as you don't deactivate or
    // delete them" — and `paymentLink.id` is the only handle DeletePaymentLink
    // accepts. Without it, a link raised for a charge that later gets waived
    // stays payable forever with no way to kill it. (A real $80 guest-overage
    // link did exactly that on 2026-08-10.)
    const linkId = result.paymentLink?.id ?? null
    const clean: ChargeLine[] = Array.isArray(lines) ? lines : []
    if (orderId && clean.length) {
      const rows = clean.map(l => ({
        booking_id:             params.id,
        equipment_id:           l.equipmentId ?? null,
        quantity:               l.quantity ?? 1,
        rate:                   l.equipmentId && l.unitRate != null ? l.unitRate : l.amount,
        paid:                   false,
        square_order_id:        orderId,
        square_payment_link_id: linkId,
        // Starts the 48-hour clock for /api/cron/unpaid-links. Without this the
        // sweep can never see the row — it deliberately skips NULLs so it won't
        // back-date old links and text people about weeks-old charges.
        link_sent_at:           new Date().toISOString(),
        // Store what the line IS. An equipment line reads its name through
        // equipment_id; a free-form line had nothing and rendered as "Item".
        label:                  (l.label ?? '').trim() || null,
      }))
      const { data: inserted, error: insErr } = await supabase
        .from('booking_add_ons').insert(rows).select('id')
      if (insErr || !inserted?.length) {
        // Loud, but NOT fatal — the link is already live and the customer may
        // be about to pay it. Better a link that needs manual reconciliation
        // than an admin who thinks nothing was sent.
        console.error('[payment-link] add-ons insert failed — this payment will NOT auto-reconcile:', insErr)
      }
    } else if (!orderId) {
      console.error('[payment-link] Square returned no orderId — this payment will NOT auto-reconcile')
    }

    let smsError: string | null = null
    if (sendSms && phone) {
      const msg = [
        `Hi ${customerName}! Your Made Kulture booking has been updated.`,
        ``,
        `Please pay the balance of $${Number(amount).toFixed(2)}:`,
        url,
        ``,
        `Questions? Text (832) 408-1631`,
      ].join('\n')

      const r = await sendSMSResult(phone, msg)
      if (!r.ok) smsError = r.error ?? 'SMS failed to send'
    }

    return NextResponse.json({ success: true, url, smsError })
  } catch (err: any) {
    console.error('Payment link error:', err)
    const msg = err?.errors?.[0]?.detail || err.message || 'Failed to create payment link'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
