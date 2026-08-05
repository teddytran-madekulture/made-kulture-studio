// Square Orders — so a customer's card receipt says what they actually bought.
//
// A payment created without an order shows "Custom Amount" on the receipt and in
// the Square dashboard. The `note` field does NOT change that — the receipt line
// comes from the ORDER's line items. So we build an order, then pay it.
//
// ── The safety rule that matters ─────────────────────────────────────────────
// This is a COSMETIC improvement sitting on the money path. It must never be
// able to stop a booking being paid for. Every failure here returns null, and
// the caller pays exactly the way it does today — no order, "Custom Amount",
// booking succeeds. In particular:
//
//   Square rejects CreatePayment if the amount doesn't match the order total.
//   So we total the line items ourselves and refuse to return an order id unless
//   it equals the amount about to be charged, to the cent. A rounding difference
//   would otherwise turn a working checkout into a failed one.

import { randomUUID } from 'crypto'

export interface OrderLineInput {
  name: string          // "Set A — Aug 5, 2:00 PM–6:00 PM"
  amountCents: number   // what this line costs, before order-level discounts
}

export interface BuildOrderArgs {
  locationId: string
  customerId?: string | null
  lineItems: OrderLineInput[]
  /** Order-level reductions, e.g. a promo code or applied account credit. */
  discounts?: { name: string; amountCents: number }[]
  /** What we are about to charge the card. The order must total exactly this. */
  expectedTotalCents: number
  referenceId?: string
}

/**
 * Creates a Square order and returns its id, or null if anything at all is off.
 * Never throws.
 */
export async function createOrderForPayment(
  square: any,
  args: BuildOrderArgs
): Promise<string | null> {
  try {
    const items = args.lineItems.filter(l => l.name && l.amountCents > 0)
    if (!items.length) return null

    const discounts = (args.discounts ?? []).filter(d => d.amountCents > 0)

    const gross = items.reduce((s, l) => s + l.amountCents, 0)
    const off = discounts.reduce((s, d) => s + d.amountCents, 0)
    const net = gross - off

    // The whole point of the guard: a mismatch here is a FAILED CHECKOUT, not a
    // cosmetic problem. Bail out and let the payment go through unitemized.
    if (net !== args.expectedTotalCents) {
      console.warn(
        `[square-order] skipping order — total ${net} != charge ${args.expectedTotalCents}`
      )
      return null
    }
    // A fully discounted order can't be paid for; nothing to itemize anyway.
    if (net <= 0) return null

    const { result } = await square.ordersApi.createOrder({
      idempotencyKey: randomUUID(),
      order: {
        locationId: args.locationId,
        ...(args.customerId ? { customerId: args.customerId } : {}),
        ...(args.referenceId ? { referenceId: args.referenceId.slice(0, 40) } : {}),
        lineItems: items.map(l => ({
          name: l.name.slice(0, 512),
          quantity: '1',
          basePriceMoney: { amount: BigInt(l.amountCents), currency: 'USD' },
        })),
        ...(discounts.length
          ? {
              discounts: discounts.map(d => ({
                name: d.name.slice(0, 255),
                amountMoney: { amount: BigInt(d.amountCents), currency: 'USD' },
                scope: 'ORDER',
              })),
            }
          : {}),
      },
    })

    const order = result?.order
    if (!order?.id) return null

    // Trust Square's own arithmetic over ours before handing the id back — if
    // its total disagrees, the payment would be rejected.
    const squareTotal = Number(order.totalMoney?.amount ?? -1)
    if (squareTotal !== args.expectedTotalCents) {
      console.warn(
        `[square-order] Square totalled ${squareTotal}, expected ${args.expectedTotalCents} — not linking`
      )
      return null
    }

    return order.id
  } catch (e: any) {
    // Never surface this. An unitemized receipt is a small annoyance; a failed
    // booking is a lost customer.
    console.error('[square-order] createOrder failed (non-fatal):', e?.message || e)
    return null
  }
}
