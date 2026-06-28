import { NextRequest, NextResponse } from 'next/server'
import { createHmac, timingSafeEqual } from 'crypto'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// The exact URL configured in the Square webhook subscription — used for
// signature verification (Square signs notificationUrl + body).
const NOTIFICATION_URL =
  `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://made-kulture-studio.vercel.app'}/api/webhooks/square`

function verifySignature(body: string, signature: string | null): boolean {
  const key = process.env.SQUARE_WEBHOOK_SIGNATURE_KEY
  if (!key) {
    // Allow processing before the key is configured, but warn loudly.
    console.warn('[Square webhook] SQUARE_WEBHOOK_SIGNATURE_KEY not set — skipping signature verification')
    return true
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
// Marks equipment add-ons paid when their Square payment-link order completes.
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
      const { error, count } = await supabase
        .from('booking_add_ons')
        .update({ paid: true }, { count: 'exact' })
        .eq('square_order_id', orderId)
        .eq('paid', false)
      if (error) console.error('[Square webhook] update error:', error)
      else console.log(`[Square webhook] marked ${count ?? 0} add-on(s) paid for order ${orderId}`)
    }
  }

  // Always 200 for handled/ignored events so Square doesn't retry.
  return NextResponse.json({ ok: true })
}
