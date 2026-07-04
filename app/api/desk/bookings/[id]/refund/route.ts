import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireStaff } from '@/lib/staff-auth'
import { refundPayment } from '@/lib/square-refund'
import { notifyDelegatedRefund } from '@/lib/refund-notify'
import { audit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

// POST /api/desk/bookings/[id]/refund  { amountCents?, reason? }
// Refunds the booking's original Square payment — full by default, or a partial
// amount. Money OUT, so manager+ only (payment.refund). Audited.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = requireStaff(req, 'payment.refund')
  if (g instanceof NextResponse) return g

  let body: { amountCents?: number; reason?: string } = {}
  try { body = await req.json() } catch { /* full refund, no reason */ }

  const { data: b } = await supabaseAdmin()
    .from('bookings')
    .select('id, total_amount, square_payment_id, customers ( name )')
    .eq('id', params.id)
    .maybeSingle()
  if (!b) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
  if (!b.square_payment_id) {
    return NextResponse.json({ error: 'No Square payment on file for this booking — it may have been paid another way. Refund in Square directly.' }, { status: 400 })
  }

  const fullCents = Math.round(Number(b.total_amount || 0) * 100)
  const amountCents = body.amountCents ? Math.round(body.amountCents) : fullCents
  if (amountCents < 1) return NextResponse.json({ error: 'Nothing to refund.' }, { status: 400 })
  if (fullCents && amountCents > fullCents) {
    return NextResponse.json({ error: `Refund can’t exceed the booking total ($${(fullCents / 100).toFixed(2)}).` }, { status: 400 })
  }

  try {
    const refund = await refundPayment({ paymentId: b.square_payment_id, amountCents, reason: body.reason || 'Made Kulture booking refund' })
    await audit(g, 'payment.refund', {
      entityType: 'booking', entityId: params.id, amountCents,
      details: { reason: body.reason ?? null, refundId: refund.id, customer: (b.customers as any)?.name ?? null },
    })
    // If a third party paid (delegated "someone else pays"), tell them.
    await notifyDelegatedRefund(params.id, amountCents)
    return NextResponse.json({ success: true, amountCents, refundId: refund.id })
  } catch (e: any) {
    console.error('[booking refund] failed', e)
    return NextResponse.json({ error: e?.errors?.[0]?.detail || 'Refund failed.' }, { status: 402 })
  }
}
