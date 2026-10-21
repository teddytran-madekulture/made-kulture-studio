// /api/admin/balances — every payment link that has been sent and not paid,
// across ALL bookings, in one place (2026-10-21).
//
// Why: Teddy sends pay links (extra time, gear, fees) and had no single view of
// who still owes. A link nobody follows up on is money left on the table, and a
// link that WAS paid left him wondering whether to chase it.
//
// Source of truth: booking_add_ons rows with paid = false. Those are written by
// /api/admin/bookings/[id]/payment-link (Add Charge, and Edit Booking's SEND LINK
// since 2026-10-21) and flipped to paid by the Square webhook. Links sent from
// Edit Booking BEFORE that fix were never recorded and cannot appear here.
//
//   GET                → { rows, totals }
//   GET ?count=1       → { count }   (sidebar badge; active bookings only)
//   POST { addOnId, action: 'resend' }     → re-text the customer the same link
//   POST { addOnId, action: 'mark_paid' }  → paid outside Square (cash/Zelle):
//        claim the row, bump the booking total, and DELETE the Square link so it
//        can't also be paid by card. Waiving (no money) is the existing
//        /api/admin/bookings/[id]/cancel-link.
import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { Client, Environment } from 'square'
import { createClient } from '@supabase/supabase-js'
import { sendSMSResult } from '@/lib/sms'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const square = new Client({
  accessToken: process.env.SQUARE_ACCESS_TOKEN!,
  environment: process.env.SQUARE_ENVIRONMENT === 'production'
    ? Environment.Production : Environment.Sandbox,
})
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const amountOf = (r: any) => Math.round(Number(r.rate || 0) * Number(r.quantity || 1) * 100) / 100
const labelOf = (r: any) => (r.equipment?.name as string) || (r.label as string) || 'Charge'

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // ⚠️ Fail loudly: a failed read must never render as "nobody owes anything".
  const { data, error } = await supabase
    .from('booking_add_ons')
    .select(`
      id, booking_id, rate, quantity, label, square_payment_link_id, square_order_id,
      link_sent_at, reminder_sent_at,
      equipment ( name ),
      bookings ( id, start_time, end_time, status, sets ( name ), customers ( name, phone, email ) )
    `)
    .eq('paid', false)
    .limit(1000)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []).map((r: any) => {
    const b = r.bookings ?? {}
    const c = b.customers ?? {}
    return {
      id: r.id,
      bookingId: r.booking_id,
      label: labelOf(r),
      amount: amountOf(r),
      hasLink: !!(r.square_payment_link_id || r.square_order_id),
      linkSentAt: r.link_sent_at ?? null,
      reminderSentAt: r.reminder_sent_at ?? null,
      bookingStart: b.start_time ?? null,
      bookingEnd: b.end_time ?? null,
      bookingStatus: b.status ?? null,
      setName: b.sets?.name ?? 'Full Studio Takeover',
      customerName: c.name ?? '',
      customerPhone: c.phone ?? '',
      customerEmail: c.email ?? '',
    }
  }).sort((a, b) => String(a.linkSentAt ?? a.bookingStart ?? '').localeCompare(String(b.linkSentAt ?? b.bookingStart ?? '')))

  const active = rows.filter(r => r.bookingStatus !== 'cancelled')
  if (req.nextUrl.searchParams.get('count')) return NextResponse.json({ count: active.length })
  return NextResponse.json({
    rows,
    totals: { count: active.length, amount: Math.round(active.reduce((s, r) => s + r.amount, 0) * 100) / 100 },
  })
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { addOnId, action } = await req.json().catch(() => ({}))
  if (!addOnId || !['resend', 'mark_paid'].includes(action)) {
    return NextResponse.json({ error: 'addOnId and action (resend | mark_paid) are required.' }, { status: 400 })
  }

  const { data: row, error: readErr } = await supabase
    .from('booking_add_ons')
    .select('id, booking_id, paid, rate, quantity, label, square_payment_link_id, square_order_id, equipment ( name ), bookings ( status, customers ( name, phone ) )')
    .eq('id', addOnId).maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: 'That charge no longer exists.' }, { status: 404 })
  if (row.paid) return NextResponse.json({ error: 'That charge is already paid.' }, { status: 409 })
  const amount = amountOf(row)
  const label = labelOf(row)
  const cust: any = (row as any).bookings?.customers ?? {}

  if (action === 'resend') {
    if (!row.square_payment_link_id) {
      return NextResponse.json({ error: 'No Square link is stored for this charge, so it can\'t be resent. Cancel it and send a new one from Add Charge.' }, { status: 409 })
    }
    if (!cust.phone) return NextResponse.json({ error: 'This customer has no phone number on file.' }, { status: 409 })
    let url: string | null = null
    try {
      const { result } = await square.checkoutApi.retrievePaymentLink(row.square_payment_link_id)
      url = result.paymentLink?.url ?? null
    } catch (e) {
      console.error('[balances] retrievePaymentLink failed', e)
    }
    if (!url) return NextResponse.json({ error: 'That link no longer exists in Square. Cancel it here and send a new one.' }, { status: 409 })
    const msg = [
      `Hi ${cust.name || 'there'}, a reminder that $${amount.toFixed(2)} for ${label} at Made Kulture is still outstanding.`,
      ``,
      `You can pay it here:`,
      url,
      ``,
      `Already paid or think this is a mistake? Text (832) 408-1631.`,
    ].join('\n')
    const sms = await sendSMSResult(cust.phone, msg, { sentBy: 'admin' })
    if (!sms.ok) return NextResponse.json({ error: `Text failed: ${sms.error ?? 'unknown error'}` }, { status: 502 })
    await supabase.from('booking_add_ons').update({ reminder_sent_at: new Date().toISOString() }).eq('id', row.id)
    return NextResponse.json({ ok: true, sentTo: cust.phone })
  }

  // mark_paid — CLAIM first so a double tap (or the webhook racing us) bumps once.
  const { data: claimed, error: claimErr } = await supabase
    .from('booking_add_ons').update({ paid: true }).eq('id', row.id).eq('paid', false).select('id')
  if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 })
  if (!claimed?.length) return NextResponse.json({ error: 'That charge was just marked paid.' }, { status: 409 })

  const { data: bk } = await supabase.from('bookings').select('total_amount').eq('id', row.booking_id).single()
  const newTotal = Math.round((Number(bk?.total_amount || 0) + amount) * 100) / 100
  const { data: bumped, error: bumpErr } = await supabase
    .from('bookings').update({ total_amount: newTotal }).eq('id', row.booking_id).select('id')
  const totalNote = (bumpErr || !bumped?.length) ? 'Marked paid, but the booking total did NOT update. Fix it in Edit Booking.' : null
  if (totalNote) console.error('[balances] mark_paid total bump failed', row.booking_id, bumpErr)

  // Kill the Square link so it can't ALSO be paid by card. Non-fatal.
  let linkNote: string | null = null
  if (row.square_payment_link_id) {
    try { await square.checkoutApi.deletePaymentLink(row.square_payment_link_id) }
    catch (e) { console.error('[balances] deletePaymentLink failed', e); linkNote = 'The Square link could not be turned off; delete it in Square so it can\'t be paid twice.' }
  }
  return NextResponse.json({ ok: true, amount, newTotal, note: totalNote ?? linkNote })
}
