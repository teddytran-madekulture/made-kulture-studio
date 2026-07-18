import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { issueCredit } from '@/lib/credits'
import { sendSimpleEmail } from '@/lib/email'
import { sendSMS } from '@/lib/sms'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)
const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')

// POST /api/admin/bookings/[id]/no-show-credit
// Manually approve full studio credit for a no-show (the Plus perk). Issues the
// booking's value as non-expiring credit and notifies the member. Guards against
// double-crediting the same booking.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: booking } = await supabase
    .from('bookings')
    .select('id, auth_user_id, total_amount, status, customers(name, email, phone)')
    .eq('id', params.id).maybeSingle()
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })

  const authUserId = (booking as any).auth_user_id
  if (!authUserId) return NextResponse.json({ error: 'This booking has no account, so credit can’t be stored.' }, { status: 400 })

  const cents = Math.round(Number((booking as any).total_amount || 0) * 100)
  if (cents < 1) return NextResponse.json({ error: 'Nothing to credit on this booking.' }, { status: 400 })

  // Don't credit the same booking twice.
  const { data: prior } = await supabase
    .from('credit_ledger').select('id').eq('booking_id', params.id).gt('amount_cents', 0).limit(1)
  if (prior && prior.length) return NextResponse.json({ error: 'This booking has already been credited.' }, { status: 400 })

  const r = await issueCredit(authUserId, cents, {
    kind: 'issued', reason: 'No-show → Plus studio credit', bookingId: params.id, createdBy: 'admin',
  })
  if (!r.ok) return NextResponse.json({ error: r.error || 'Could not add credit.' }, { status: 500 })

  const cust: any = (booking as any).customers || {}
  const dollars = (cents / 100).toFixed(2)
  if (cust.email) await sendSimpleEmail({
    to: cust.email, subject: `$${dollars} studio credit added to your account`, heading: 'Studio credit added',
    paragraphs: [
      `As a Plus member, <strong style="color:#fff;">$${dollars}</strong> has been added to your Made Kulture account as studio credit for your missed session.`,
      `It never expires and applies automatically the next time you book.`,
    ],
    ctaText: 'Book your next session', ctaUrl: `${APP_URL}/availability`, label: 'no_show_credit',
  }).catch(() => {})
  if (cust.phone) await sendSMS(cust.phone, `Made Kulture: $${dollars} studio credit added to your account — it never expires and applies automatically at your next booking. ${APP_URL}/account`).catch(() => {})

  return NextResponse.json({ ok: true, amountCents: cents })
}
