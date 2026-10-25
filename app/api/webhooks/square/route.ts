import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { addRewardForCharge } from '@/lib/rewards'
import { sendOwnerPush } from '@/lib/push'
import { applyPaidDues, getNomadSettings } from '@/lib/nomad'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// The exact URL configured in the Square webhook subscription — used for
// signature verification (Square signs notificationUrl + body).
// ⚠️ 2026-09-28: this has its OWN setting (SQUARE_WEBHOOK_URL) and deliberately
// does NOT follow NEXT_PUBLIC_APP_URL. It used to, which meant flipping the site
// to madekulture.com at launch would have made every Square delivery (still
// addressed to vercel.app) fail the signature check — silently, with add-ons
// staying unpaid. Now the site address and the webhook address move separately:
// change the Square subscription URL, set SQUARE_WEBHOOK_URL to match, then
// press "send test event". Unset = the vercel.app address the subscription
// uses today.
const NOTIFICATION_URL = (
  process.env.SQUARE_WEBHOOK_URL || 'https://made-kulture-studio.vercel.app/api/webhooks/square'
).replace(/\/$/, '')

function verifySignature(body: string, signature: string | null): boolean {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
  if (!key) {
    // FAIL CLOSED. This endpoint marks add-ons paid and bumps booking totals
    // off an unauthenticated public URL, so an unverifiable request has to be
    // refused — anyone who knows the URL could otherwise post a fake
    // `payment.updated` and move money on the record. If this ever fires, the
    // env var is missing on this deployment; Square will retry for ~72h, so
    // setting the key recovers the deliveries rather than losing them.
    console.error('[Square webhook] SQUARE_WEBHOOK_SIGNATURE_KEY not set — rejecting request')
    return false
  }
  if (!signature) return false
  const expected = createHmac('sha256', key).update(NOTIFICATION_URL + body).digest('base64')
  try {
    const a = Buffer.from(signature)
    const b = Buffer.from(expected)
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

// POST /api/webhooks/square
//
// Marks equipment add-ons paid when their Square payment-link order completes,
// and bumps the booking total to match — so a link the CUSTOMER pays lands on
// the record the same way the admin Charge button does.
//
// ⚠️ Square retries a delivery until it gets a 200, so every handler here has
// to be safe to run twice. The add-on update is written as a CLAIM
// (`.eq('paid', false)`) for exactly that reason.
export async function POST(req: NextRequest) {
  const body      = await req.text()
  const signature = req.headers.get('x-square-hmacsha256-signature')

  if (!verifySignature(body, signature)) {
    return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
  }

  let event: any
  try { event = JSON.parse(body) } catch { return NextResponse.json({ error: 'Bad payload' }, { status: 400 }) }

  const type = event?.type as string | undefined
  if (type === 'payment.created' || type === 'payment.updated') {
    const payment = event?.data?.object?.payment
    const orderId = payment?.order_id
    if (payment?.status === 'COMPLETED' && orderId) {
      // 2026-10-25 — Nomad dues payment links. Same CLAIM pattern: a retried
      // delivery claims zero rows. Non-fatal for the rest of this handler.
      try {
        const { data: nomadPaid } = await supabase.from('nomad_charges')
          .update({ status: 'paid_link', square_payment_id: payment?.id ?? null })
          .eq('square_order_id', orderId).eq('status', 'link_sent').select('*')
        for (const ch of nomadPaid ?? []) {
          if (ch.kind === 'dues') {
            const m: any = await applyPaidDues(supabase as any, ch, await getNomadSettings(supabase as any))
            await sendOwnerPush({ title: 'Nomad: dues paid by link', body: `${m?.name || m?.email || 'A member'} paid $${(Number(ch.amount_cents) / 100).toFixed(0)}${m?.covered ? ' (that month was already paid, so it bought the next one)' : ''}`, url: '/admin/nomad', tag: `paid-${orderId}` })
          }
        }
        if (!nomadPaid?.length) {
          // A Nomad link paid after it was voided or marked paid by hand = money
          // with no month attached. Never let that pass silently.
          const { data: dead } = await supabase.from('nomad_charges').select('id, status, square_payment_id, nomad_memberships ( name, email )').eq('square_order_id', orderId).in('status', ['void', 'paid_link']).limit(1)
          const d0: any = dead?.[0]
          if (d0 && d0.square_payment_id !== (payment?.id ?? null)) {
            await sendOwnerPush({ title: '⚠️ Nomad: a closed payment link was paid', body: `${d0.nomad_memberships?.name || d0.nomad_memberships?.email || 'A member'} paid a link that was already ${d0.status === 'void' ? 'voided' : 'marked paid'}. Refund it or credit a month.`, url: '/admin/nomad', requireInteraction: true })
          }
        }
      } catch (e) {
        console.error('[Square webhook] nomad reconcile failed', e)
      }

      // CLAIM the rows: `.eq('paid', false)` + `.select()` means a retried
      // delivery (Square retries for ~72h) claims zero rows and does nothing.
      // Without that guard the total below would be added twice.
      const { data: claimed, error } = await supabase
        .from('booking_add_ons')
        .update({ paid: true })
        .eq('square_order_id', orderId)
        .eq('paid', false)
        .select('id, booking_id, rate, quantity')

      if (error) {
        console.error('[Square webhook] update error:', error)
      } else if (!claimed?.length) {
        console.log(`[Square webhook] order ${orderId} — nothing left to claim (already handled, or not ours)`)
      } else {
        console.log(`[Square webhook] marked ${claimed.length} add-on(s) paid for order ${orderId}`)

        // Bump each affected booking's total so a link paid by the customer
        // lands on the record the same way the admin Charge button does.
        const byBooking = new Map<string, number>()
        for (const r of claimed as any[]) {
          const amt = Number(r.rate || 0) * Number(r.quantity || 1)
          byBooking.set(r.booking_id, (byBooking.get(r.booking_id) ?? 0) + amt)
        }
        for (const [bookingId, addAmount] of byBooking) {
          if (!bookingId || addAmount <= 0) continue
          const { data: bk } = await supabase
            .from('bookings').select('total_amount').eq('id', bookingId).single()
          const newTotal = Math.round((Number(bk?.total_amount || 0) + addAmount) * 100) / 100
          const { data: bumped, error: bumpErr } = await supabase
            .from('bookings').update({ total_amount: newTotal }).eq('id', bookingId).select('id')
          if (bumpErr || !bumped?.length) {
            console.error(`[Square webhook] add-ons marked paid but booking ${bookingId} total NOT bumped by ${addAmount}`, bumpErr)
          }
          // 2026-10-15 — money paid through a link (extra time, added gear) earns
          // rewards like a card charge. Claim-guarded above, so a retried
          // delivery never gets here twice. Non-fatal.
          await addRewardForCharge(supabase, bookingId, Math.round(addAmount * 100), 'paid link')

          // 2026-10-21 — tell Teddy the link got paid, so he never wonders whether
          // to follow up. Claim-guarded above (a retried delivery never gets here),
          // lands in Notifications history too. Non-fatal.
          try {
            const { data: who } = await supabase
              .from('bookings').select('customers ( name )').eq('id', bookingId).single()
            const name = (who as any)?.customers?.name || 'A customer'
            const { count: left } = await supabase
              .from('booking_add_ons').select('id', { count: 'exact', head: true })
              .eq('booking_id', bookingId).eq('paid', false)
            const amt = `$${addAmount.toFixed(2).replace(/\.00$/, '')}`
            await sendOwnerPush({
              title: `${name} paid ${amt}`,
              body: left ? `Link paid. ${left} more unpaid on that booking.` : 'Link paid, balance cleared.',
              url: '/admin/balances',
              tag: `paid-${orderId}`,
            })
          } catch (e) {
            console.error('[Square webhook] paid push failed', e)
          }
        }
      }
    }
  }

  // ── A card on file went bad ──────────────────────────────────────────────
  //
  // Square emits these when the ISSUER tells it something changed: the card was
  // reissued, the expiry moved, or the account closed. Recording them is the
  // difference between finding out days early and finding out as a
  // GENERIC_DECLINE while the customer is standing there.
  //
  // Recorded, never acted on automatically — we don't delete cards or cancel
  // anything off an issuer notice. It surfaces as a warning next to the card.
  if (type === 'card.automatically_updated' || type === 'card.disabled') {
    const card = event?.data?.object?.card
    const cardId = card?.id ?? event?.data?.id
    if (cardId) {
      const { error } = await supabase.from('card_alerts').insert({
        square_card_id:     cardId,
        square_customer_id: card?.customer_id ?? null,
        event_type:         type,
        detail:             card ?? null,
      })
      // Loud on failure: a swallowed insert here means the warning never
      // appears and we're back to discovering the decline at the counter.
      if (error) console.error('[Square webhook] card_alerts insert failed for', cardId, error)
      else console.log(`[Square webhook] recorded ${type} for card ${cardId}`)
    }
  }

  // Always 200 for handled/ignored events so Square doesn't retry.
  return NextResponse.json({ ok: true })
}
