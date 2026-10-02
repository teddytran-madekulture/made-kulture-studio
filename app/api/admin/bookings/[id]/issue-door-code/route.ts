// POST /api/admin/bookings/[id]/issue-door-code
//
// 2026-10-02 — Acuity shutdown. Bookings that came in through Acuity never got
// a door code (the Acuity webhook doesn't mint one), so Teddy was letting those
// guests in by hand. This gives ONE existing booking a code and tells the guest
// how to get it, the same way a website booking does: the code lives on the
// check-in page (lib/igloohome.ts CODE_REVEAL_MINUTES), the text carries the link.
//
// ⚠️ Mints ONLY when the row has no code yet. igloohome algoPINs cannot be
// revoked, so a second click must never leave a spare live code on the building
// — it just re-sends the link.
//
// Body: { notify?: boolean }  (default true — text + email the guest)

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { sendSMSResult } from '@/lib/sms'
import { sendSimpleEmail, formatDateLabel, formatTimeLabel } from '@/lib/email'
import { issueDoorCodes, doorCodesEnabled, doorCodeLinkLine, checkInUrl, CODE_REVEAL_MINUTES } from '@/lib/igloohome'
import { centralDateStr, centralHourDecimal } from '@/lib/booking-times'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const notify = body?.notify !== false

  const { data: b, error } = await supabase
    .from('bookings')
    .select('id, start_time, end_time, status, door_code, door_code_back, check_in_token, customers(name, email, phone), sets(name)')
    .eq('id', params.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!b) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })

  const row: any = b
  const cust = Array.isArray(row.customers) ? row.customers[0] : row.customers
  const setRow = Array.isArray(row.sets) ? row.sets[0] : row.sets
  if (row.status === 'cancelled' || row.status === 'canceled') return NextResponse.json({ error: 'This booking is cancelled.' }, { status: 400 })
  if (Date.parse(row.end_time) < Date.now()) return NextResponse.json({ error: 'This booking is already over.' }, { status: 400 })
  if (!doorCodesEnabled()) return NextResponse.json({ error: 'Door codes are not configured on this deployment.' }, { status: 503 })

  let minted = false
  if (!row.door_code && !row.door_code_back) {
    const codes = await issueDoorCodes(supabase, row.id, {
      startISO: row.start_time,
      endISO: row.end_time,
      accessName: `MK ${cust?.name || 'booking'}`.slice(0, 40),
    })
    if (!codes.doorCode && !codes.doorCodeBack) {
      return NextResponse.json({ error: 'igloohome did not return a code. Nothing was sent.' }, { status: 502 })
    }
    minted = true
  }
  if (!notify) return NextResponse.json({ success: true, minted, smsOk: false, emailOk: false })
  if (!cust?.phone && !cust?.email) return NextResponse.json({ success: true, minted, smsOk: false, emailOk: false, warning: 'No phone or email on this booking.' })

  const setName = setRow?.name ?? 'Full Studio'
  const first = (cust?.name || '').split(' ')[0]
  const when = `${formatDateLabel(centralDateStr(row.start_time))}, ${formatTimeLabel(centralHourDecimal(row.start_time))} - ${formatTimeLabel(centralHourDecimal(row.end_time))}`

  let smsOk = false, emailOk = false, firstError: string | null = null
  if (cust?.phone) {
    // GSM-7 only: no emoji, no typographic dashes (see sms-gsm7-segments).
    const r = await sendSMSResult(cust.phone, [
      `Made Kulture: ${first ? `hi ${first}, ` : ''}you're booked in ${setName}, ${when}.`,
      `Good news: your session now has its own door code, so no need to wait for us to let you in.`,
      doorCodeLinkLine(row.check_in_token),
    ].join('\n')).catch(() => ({ ok: false, error: 'SMS failed' } as any))
    smsOk = (r as any)?.ok === true
    if (!smsOk) firstError = (r as any)?.error || 'SMS failed'
  }
  if (cust?.email) {
    try {
      const sent = await sendSimpleEmail({
        to: cust.email,
        subject: `Your door code for ${setName} at Made Kulture`,
        heading: 'Your session has a door code',
        paragraphs: [
          `<strong style="color:#fff;">${setName}</strong> · ${when}`,
          'Your booking now comes with its own door code, so you can let yourself in at your start time.',
          `When you arrive, open your check-in page and tap <strong style="color:#fff;">CHECK IN</strong>. Your code appears there, starting ${CODE_REVEAL_MINUTES} minutes before your session, and it works from your booked start time.`,
        ],
        ctaText: 'Open my check-in page',
        ctaUrl: row.check_in_token ? checkInUrl(row.check_in_token) : undefined,
        label: 'door_code_issue',
      } as any)
      emailOk = !!sent
    } catch (e: any) {
      if (!firstError) firstError = e?.message || 'email failed'
    }
  }
  return NextResponse.json({ success: true, minted, smsOk, emailOk, error: smsOk || emailOk ? undefined : firstError })
}
