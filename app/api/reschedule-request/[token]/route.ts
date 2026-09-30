// /api/reschedule-request/[token] — the owner's decision on a reschedule request.
//   GET              → the request (for /reschedule/approve/[token])
//   POST {action:'approve'}                 → moves the booking (full gates, owner-approved)
//   POST {action:'decline', reason?}        → texts + emails the member; booking unchanged
//
// Possession of the token IS the authorization, exactly like the short-notice
// approve link: it only ever goes to the owner (SMS + push + admin banner).
// ⚠️ Both approval surfaces — the token page and the dashboard banner — POST
// here, so they cannot behave differently.
import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { rescheduleBooking, rescheduleFailed } from '@/lib/reschedule'
import { RR_COLS, isExpired, type RescheduleRequestRow } from '@/lib/reschedule-requests'
import { sendSMS } from '@/lib/sms'
import { sendSimpleEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function load(token: string): Promise<RescheduleRequestRow | null> {
  if (!/^[a-f0-9]{20,64}$/.test(token)) return null
  const { data } = await service.from('reschedule_requests').select(RR_COLS).eq('token', token).maybeSingle()
  return (data as unknown as RescheduleRequestRow) ?? null
}

export async function GET(_req: NextRequest, { params }: { params: { token: string } }) {
  const r = await load(params.token)
  if (!r) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  return NextResponse.json({ request: { ...r, status: isExpired(r) ? 'expired' : r.status } })
}

const DECLINE_WHY: Record<string, string> = {
  unavailable: 'we can’t have someone at the studio then',
  booked: 'the studio is already committed then',
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const r = await load(params.token)
  if (!r) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  const body = await req.json().catch(() => ({} as any))
  const action = String(body.action || '')

  if (isExpired(r)) {
    await service.from('reschedule_requests').update({ status: 'expired', decided_at: new Date().toISOString() }).eq('id', r.id).eq('status', 'pending')
    return NextResponse.json({ error: 'This request has expired — the time has already passed.' }, { status: 409 })
  }
  if (r.status !== 'pending') {
    return NextResponse.json({ error: `This request was already ${r.status}.` }, { status: 409 })
  }

  // ⚠️ CLAIM the row first, so a double tap (or the page and the banner at once)
  // can't both act. `.select()` proves a row changed — supabase-js doesn't throw.
  const claimTo = action === 'approve' ? 'approving' : action === 'decline' ? 'declined' : null
  if (!claimTo) return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  const { data: claimed, error: claimErr } = await service
    .from('reschedule_requests')
    .update({ status: claimTo, decided_at: new Date().toISOString(), ...(action === 'decline' ? { decision_note: String(body.reason || 'other') } : {}) })
    .eq('id', r.id).eq('status', 'pending')
    .select('id')
  if (claimErr) return NextResponse.json({ error: claimErr.message }, { status: 500 })
  if (!claimed?.length) return NextResponse.json({ error: 'Someone already answered this request.' }, { status: 409 })

  if (action === 'approve') {
    const result = await rescheduleBooking(service, {
      bookingId: r.booking_id,
      date: r.new_date,
      startHour: Number(r.new_start_hour),
      via: 'account',
      actorEmail: r.customer_email,
      ownerApproved: { expectOldStartISO: r.old_start },
    })
    if (rescheduleFailed(result)) {
      await service.from('reschedule_requests').update({ status: 'failed', decision_note: result.error }).eq('id', r.id)
      return NextResponse.json({ error: `Couldn’t move it: ${result.error}` }, { status: result.status })
    }
    await service.from('reschedule_requests').update({ status: 'approved' }).eq('id', r.id)
    return NextResponse.json({ ok: true, status: 'approved', when: result.when })
  }

  // ── Decline: tell the member, change nothing ─────────────────────────────
  const { data: b } = await service
    .from('bookings').select('customers(name, email, phone)').eq('id', r.booking_id).maybeSingle()
  const cust: any = (b as any)?.customers
  const why = DECLINE_WHY[String(body.reason)] ?? ''
  await Promise.allSettled([
    cust?.phone ? sendSMS(cust.phone, [
      `Made Kulture - we couldn't make ${r.when_new} work${why ? ` (${why})` : ''}.`,
      ``,
      `Your session stays at ${r.when_old}${r.set_name ? `, ${r.set_name}` : ''}. Your door code hasn't changed.`,
      ``,
      `Questions? Text (832) 408-1631.`,
    ].join('\n')) : Promise.resolve(),
    (cust?.email || r.customer_email) ? sendSimpleEmail({
      to: cust?.email || r.customer_email!,
      subject: 'About your reschedule request',
      heading: 'We couldn’t make that time work',
      paragraphs: [
        `You asked to move your ${r.set_name ?? ''} session to <strong style="color:#fff;">${r.when_new}</strong>${why ? ` — unfortunately ${why}` : ''}.`,
        `Your session stays booked at <strong style="color:#fff;">${r.when_old}</strong>, and your door code hasn’t changed.`,
        `Want a different time? Text (832) 408-1631 and we’ll help.`,
      ],
      label: 'reschedule_request_declined',
    }) : Promise.resolve(),
  ])
  return NextResponse.json({ ok: true, status: 'declined' })
}
