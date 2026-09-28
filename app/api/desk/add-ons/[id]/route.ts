import { NextRequest, NextResponse } from 'next/server'
import { adjustRewardForRefund } from '@/lib/rewards'
import { supabaseAdmin } from '@/lib/supabase'
import { requireStaff } from '@/lib/staff-auth'
import { can } from '@/lib/staff-permissions'
import { refundPayment } from '@/lib/square-refund'
import { issueCredit } from '@/lib/credits'
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
    .select('id, booking_id, quantity, rate, paid, square_order_id, credit_cents, label, equipment ( name )')
    .eq('id', params.id)
    .maybeSingle()
  if (!addon) return NextResponse.json({ error: 'Add-on not found.' }, { status: 404 })

  const name = (addon.equipment as any)?.name ?? (addon as any).label ?? 'gear'
  // Migration 112: part of this line may have been paid with studio credit.
  // Refund only the CARD part; the credit part goes back as credit.
  const creditPart = Math.max(0, Number((addon as any).credit_cents) || 0)
  const fullCents = Math.round(Number(addon.rate) * Number(addon.quantity) * 100)
  const amountCents = Math.max(0, fullCents - creditPart)

  // Charged → needs a refund, which is manager-gated.
  if (addon.paid) {
    if (!can(g.role, 'payment.refund')) {
      return NextResponse.json({ error: 'This item was charged — only a manager can remove it (it issues a refund).' }, { status: 403 })
    }
    if (amountCents > 0 && !addon.square_order_id) {
      return NextResponse.json({ error: 'No payment reference on this item — refund it in Square first, then remove.' }, { status: 400 })
    }
    let creditWarn: string | null = null
    try {
      if (amountCents > 0) await refundPayment({ paymentId: addon.square_order_id!, amountCents, reason: `Removed ${name} from booking` })
      if (creditPart > 0) {
        const { data: led } = await db.from('credit_ledger').select('auth_user_id')
          .eq('booking_id', addon.booking_id).eq('kind', 'redeemed').order('created_at', { ascending: false }).limit(1).maybeSingle()
        const r = led?.auth_user_id
          ? await issueCredit(led.auth_user_id, creditPart, { kind: 'issued', reason: `${name} removed — credit returned`, bookingId: addon.booking_id, createdBy: 'staff' })
          : { ok: false, error: 'no account found' }
        // ⚠️ Never return early here: the card part may already be refunded, and
        // a "not removed" answer invites a second click = a second refund.
        if (!r.ok) creditWarn = `The $${(creditPart / 100).toFixed(2)} studio credit could not be returned automatically (${r.error}) — add it back by hand.`
      }
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
    await adjustRewardForRefund(db, addon.booking_id, amountCents, `${name} removed and refunded`)
    return NextResponse.json({ success: true, refunded: amountCents > 0, amountCents, creditReturnedCents: creditWarn ? 0 : creditPart, warning: creditWarn })
  }

  // Not charged → simple delete.
  if (!can(g.role, 'addon.add')) return NextResponse.json({ error: 'You don’t have permission to do that.' }, { status: 403 })
  await db.from('booking_add_ons').delete().eq('id', params.id)
  await audit(g, 'booking.remove_gear', { entityType: 'booking', entityId: addon.booking_id ?? undefined, details: { name, refunded: false } })
  return NextResponse.json({ success: true, refunded: false })
}
