import { Client, Environment } from 'square'
import { randomUUID } from 'crypto'

const square = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN!,
  environment: process.env.SQUARE_ENVIRONMENT === 'production' ? Environment.Production : Environment.Sandbox,
})

// Refund (all or part of) a completed Square payment. Used when removing a
// charged add-on. Money OUT — callers must gate with the 'payment.refund'
// permission and audit the action.
export async function refundPayment(opts: { paymentId: string; amountCents: number; reason?: string }) {
  const res = await square.refundsApi.refundPayment({
    idempotencyKey: randomUUID(),
    paymentId: opts.paymentId,
    amountMoney: { amount: BigInt(Math.round(opts.amountCents)), currency: 'USD' },
    reason: opts.reason?.slice(0, 192),
  })
  const refund = res.result.refund
  return { id: refund?.id, status: refund?.status }
}
