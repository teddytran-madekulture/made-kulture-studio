import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { Client, Environment } from 'square'
import { createClient } from '@supabase/supabase-js'

// POST /api/admin/bookings/[id]/cancel-link   { addOnId }
//
// Kill an UNPAID payment link and clear the line it was raised for.
//
// This is the "waive" that didn't exist. Before it, deciding not to charge
// someone left two things behind: a live Square link they could still pay, and
// an add-on row rendering as `… (UNPAID)` on the booking forever.
//
// ⚠️ Square payment links DO NOT EXPIRE — "the link will be active as long as
// you don't deactivate or delete them. There is no expiry date." Walking away
// from one does not retire it. DeletePaymentLink both removes the link and
// cancels its associated order, which is what actually makes it unpayable.
//
// ⚠️ REFUSES to touch a PAID row. Once money has moved, the add-on is a record
// of a real transaction; removing it would silently overstate what the customer
// still owes and understate what they paid. Refund in Square instead.

const square = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN!,
  environment: process.env.SQUARE_ENVIRONMENT === 'production'
    ? Environment.Production : Environment.Sandbox,
})

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Rows written before migration 094 have no square_payment_link_id — only the
// order id. Square has no "get link by order id", so find it by listing links
// and matching. Bounded: newest first, a few pages, then give up rather than
// walking the whole account.
async function findLinkIdByOrderId(orderId: string): Promise<string | null> {
  let cursor: string | undefined
  for (let page = 0; page < 5; page++) {
    const { result } = await square.checkoutApi.listPaymentLinks(cursor, 100)
    const hit = (result.paymentLinks ?? []).find(l => l.orderId === orderId)
    if (hit?.id) return hit.id
    cursor = result.cursor
    if (!cursor) break
  }
  return null
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const { addOnId } = await req.json()
    if (!addOnId) return NextResponse.json({ error: 'addOnId is required.' }, { status: 400 })

    const { data: row, error: readErr } = await supabase
      .from('booking_add_ons')
      .select('id, booking_id, paid, rate, quantity, label, square_order_id, square_payment_link_id')
      .eq('id', addOnId)
      .eq('booking_id', params.id)     // the row must belong to THIS booking
      .maybeSingle()

    if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
    if (!row)    return NextResponse.json({ error: 'That charge line was not found on this booking.' }, { status: 404 })

    if (row.paid) {
      return NextResponse.json({
        error: 'That line is already PAID — cancelling it would misstate the booking. Refund it in Square instead.',
      }, { status: 409 })
    }

    // ── Kill the Square link, if we can find one ────────────────────────────
    let linkId  = row.square_payment_link_id ?? null
    let linkNote: string
    if (!linkId && row.square_order_id) linkId = await findLinkIdByOrderId(row.square_order_id)

    if (linkId) {
      try {
        await square.checkoutApi.deletePaymentLink(linkId)
        linkNote = 'Square link deleted and its order cancelled.'
      } catch (e: any) {
        // A link that is already gone is a SUCCESS for our purposes — the goal
        // is "unpayable", and it is. Anything else is a real failure and must
        // stop us before we delete the row, or the link outlives its record.
        const detail = e?.errors?.[0]?.detail || e?.message || ''
        const code   = e?.errors?.[0]?.code || ''
        if (code === 'NOT_FOUND' || /not found/i.test(detail)) {
          linkNote = 'Square link was already gone.'
        } else {
          console.error('[cancel-link] deletePaymentLink failed', e)
          return NextResponse.json({
            error: `Could not delete the Square link (${detail || 'unknown error'}) — the charge line was left in place so it does not lose its link.`,
          }, { status: 502 })
        }
      }
    } else {
      linkNote = row.square_order_id
        ? 'No matching Square link found (it may already have been deleted) — clearing the line only.'
        : 'No Square link was attached to this line — clearing the line only.'
    }

    // ── Clear the line ──────────────────────────────────────────────────────
    // Guarded on paid=false a SECOND time, at the database: between the read
    // above and here, the customer could have paid the link. A blind delete
    // would erase a real payment's record.
    const { data: gone, error: delErr } = await supabase
      .from('booking_add_ons')
      .delete()
      .eq('id', row.id)
      .eq('paid', false)
      .select('id')

    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 500 })
    if (!gone?.length) {
      return NextResponse.json({
        error: 'That line was paid while this was in flight, so it was left alone. Reload the booking.',
      }, { status: 409 })
    }

    const amount = Number(row.rate ?? 0) * Number(row.quantity ?? 1)
    return NextResponse.json({
      success: true,
      cancelled: { label: row.label || 'Charge', amount },
      note: linkNote,
    })
  } catch (err: any) {
    console.error('[cancel-link] error:', err)
    return NextResponse.json({ error: err?.message || 'Could not cancel that link.' }, { status: 500 })
  }
}
