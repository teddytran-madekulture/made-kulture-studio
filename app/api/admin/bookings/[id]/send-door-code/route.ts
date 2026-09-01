// POST /api/admin/bookings/[id]/send-door-code
//
// Send the booking's CURRENT door code to the customer, by text and email.
//
// Why this exists: an admin reschedule mints a fresh algoPIN and deliberately
// sends it to the OWNER, not the customer — a code changing silently under
// somebody is worse than a code arriving late, and a text fired off a calendar
// tidy-up would be a surprise. But that left forwarding it as a manual step, and
// a manual step in the middle of "the guest cannot get in the door" is the one
// that gets dropped at 9pm on a Friday. This is the same decision, one tap.
//
// ⚠️ Sends what is ALREADY ON THE ROW. It never mints a code — igloohome PINs
// cannot be revoked, so issuing a spare because somebody clicked twice leaves a
// live credential on the building forever.

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
// ⚠️ sendSMSResult, NOT sendSMS. sendSMS is fire-and-forget and returns void —
// checking its result for success would evaluate `undefined`, so every failed
// text would have reported as delivered. This whole route exists to stop a guest
// standing at a locked door, so it is the one place that must not guess.
import { sendSMSResult } from '@/lib/sms'
import { sendSimpleEmail, formatDateLabel, formatTimeLabel } from '@/lib/email'
import { DOOR_CODE_HOWTO } from '@/lib/igloohome'
import { centralDateStr, centralHourDecimal } from '@/lib/booking-times'

export const dynamic = 'force-dynamic'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: b, error } = await supabase
    .from('bookings')
    .select('id, start_time, end_time, status, door_code, door_code_back, customers(name, email, phone), sets(name)')
    .eq('id', params.id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!b) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })

  const row: any = b
  const cust = Array.isArray(row.customers) ? row.customers[0] : row.customers
  const setRow = Array.isArray(row.sets) ? row.sets[0] : row.sets

  if (row.status === 'cancelled') {
    return NextResponse.json({ error: 'This booking is cancelled — sending a door code for it would tell the customer the opposite.' }, { status: 400 })
  }
  if (!row.door_code && !row.door_code_back) {
    return NextResponse.json({
      error: 'There is no door code on this booking to send. (Manual bookings made before door codes were wired up have none — edit and re-save the booking to mint one.)',
    }, { status: 400 })
  }
  if (!cust?.phone && !cust?.email) {
    return NextResponse.json({ error: 'This booking has no phone or email on it — nothing to send to.' }, { status: 400 })
  }

  const setName = setRow?.name ?? 'Full Studio'
  const when = `${formatDateLabel(centralDateStr(row.start_time))}, ${formatTimeLabel(centralHourDecimal(row.start_time))} – ${formatTimeLabel(centralHourDecimal(row.end_time))}`
  const spaced = (c: string) => c.replace(/(\d{3})(?=\d)/g, '$1 ')

  // ⚠️ Report what actually happened per channel. `sendSMS` swallows its own
  // errors and an email can be off or rejected — telling the admin "sent" when
  // one silently didn't is how a guest ends up at a locked door with everyone
  // believing they were told.
  let smsOk = false
  let emailOk = false
  let firstError: string | null = null

  if (cust?.phone) {
    const r = await sendSMSResult(cust.phone, [
      `Made Kulture — ${setName}`,
      when,
      ``,
      ...(row.door_code ? [`🔑 Front-door code: ${spaced(row.door_code)}`] : []),
      ...(row.door_code_back ? [`🔑 Back-door code: ${spaced(row.door_code_back)}`] : []),
      DOOR_CODE_HOWTO,
      ``,
      `Questions? Text (832) 408-1631.`,
    ].join('\n')).catch(() => ({ ok: false, error: 'SMS failed' } as any))
    smsOk = (r as any)?.ok === true
    if (!smsOk) firstError = (r as any)?.error || 'SMS failed'
  }

  if (cust?.email) {
    try {
      const sent = await sendSimpleEmail({
        to: cust.email,
        subject: `Your Made Kulture door code — ${setName}`,
        heading: 'Your door code',
        paragraphs: [
          `<strong style="color:#fff;">${setName}</strong>`,
          when,
          ...(row.door_code ? [`Front door: <strong style="color:#fff;font-size:20px;letter-spacing:2px;">${row.door_code}</strong>`] : []),
          ...(row.door_code_back ? [`Back door: <strong style="color:#fff;font-size:20px;letter-spacing:2px;">${row.door_code_back}</strong>`] : []),
          DOOR_CODE_HOWTO,
          `This code only works during your booked time. Please don't share it.`,
        ],
        label: 'door_code_resend',
      })
      // sendSimpleEmail has no per-template on/off switch (unlike the booking
      // confirmation) — it returns null only when RESEND_API_KEY is unset, and
      // throws when Resend rejects. So a null here means exactly one thing.
      emailOk = !!sent
      if (!emailOk && !firstError) firstError = 'RESEND_API_KEY is not set on this deployment'
    } catch (e: any) {
      if (!firstError) firstError = e?.message || 'email failed'
    }
  }

  if (!smsOk && !emailOk) {
    return NextResponse.json({ error: `Nothing was sent — ${firstError ?? 'both channels failed'}.` }, { status: 502 })
  }

  return NextResponse.json({
    success: true,
    smsOk, emailOk,
    // So the button can say "texted" vs "emailed" vs "texted and emailed"
    // instead of a blanket tick over a half-delivery.
    to: { phone: smsOk ? cust.phone : null, email: emailOk ? cust.email : null },
    partial: !!(cust?.phone && cust?.email) && !(smsOk && emailOk),
  })
}
