import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireStaff } from '@/lib/staff-auth'
import { can } from '@/lib/staff-permissions'
import { refundPayment } from '@/lib/square-refund'
import { audit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

// DELETE /api/desk/add-ons/[id] — remove a gear add-on from a booking.
//   • Not charged (paid=false)  → just delete (any staff with addon.add).
//   • Charged (paid=true)       → refund the card, then delete (manager+ only).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = requireStaff(req)            // auth only; permission depends on paid state
  if (g instanceof NextResponse) return g

  const db = supabaseAdmin()
  const { data: addon } = await db
    .from('booking_add_ons')
    .select('id, booking_id, quantity, rate, paid, square_order_id, equipment ( name )')
    .eq('id', params.id)
    .maybeSingle()
  if (!addon) return NextResponse.json({ error: 'Add-on not found.' }, { status: 404 })

  const name = (addon.equipment as any)?.name ?? 'gear'
  const amountCents = Math.round(Number(addon.rate) * Number(addon.quantity) * 100)

  // Charged → needs a refund, which is manager-gated.
  if (addon.paid) {
    if (!can(g.role, 'payment.refund')) {
      return NextResponse.json({ error: 'This item was charged — only a manager can remove it (it issues a refund).' }, { status: 403 })
    }
    if (!addon.square_order_id) {
      return NextResponse.json({ error: 'No payment reference on this item — refund it in Square first, then remove.' }, { status: 400 })
    }
    try {
      await refundPayment({ paymentId: addon.square_order_id, amountCents, reason: `Removed ${name} from booking` })
    } catch (e: any) {
      console.error('[remove add-on] refund failed', e)
      return NextResponse.json({ error: e?.errors?.[0]?.detail || 'Refund failed — not removed.' }, { status: 402 })
    }
    // The refund has ALREADY gone through. If the row survives, the item is still
    // on the booking and removing it again issues a SECOND refund (refundPayment
    // uses a fresh idempotency key, so nothing dedupes it). Check the delete and
    // make the failure unmistakable rather than returning success.
    const { error: delErr } = await db.from('booking_add_ons').delete().eq('id', params.id)
    if (delErr) {
      console.error('[remove add-on] REFUNDED BUT NOT REMOVED —', params.id, delErr)
      return NextResponse.json({
        error: `The $${(amountCents / 100).toFixed(2)} refund WAS issued, but the item could not be removed from the booking. Do not remove it again — that would refund twice. Remove it in Square/admin by hand.`,
        refunded: true, removed: false, amountCents,
      }, { status: 500 })
    }
    await audit(g, 'booking.remove_gear', { entityType: 'booking', entityId: addon.booking_id ?? undefined, amountCents, details: { name, refunded: true } })
    return NextResponse.json({ success: true, refunded: true, amountCents })
  }

  // Not charged → simple delete.
  if (!can(g.role, 'addon.add')) return NextResponse.json({ error: 'You don’t have permission to do that.' }, { status: 403 })
  await db.from('booking_add_ons').delete().eq('id', params.id)
  await audit(g, 'booking.remove_gear', { entityType: 'booking', entityId: addon.booking_id ?? undefined, details: { name, refunded: false } })
  return NextResponse.json({ success: true, refunded: false })
}
