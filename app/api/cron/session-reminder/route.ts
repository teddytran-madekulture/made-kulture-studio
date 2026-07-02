import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSMS, toE164 } from '@/lib/sms'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/cron/session-reminder
// Runs every few minutes. Texts the customer a wrap-up reminder when their
// booking is within 15 minutes of ending — return props, pack up, check out
// before the time runs over (overages are auto-charged an extra hour).
//
// Transactional (part of the booking they paid for), so it goes to every
// booker's phone, same as the confirmation text. Twilio enforces STOP opt-outs
// globally, so no per-user flag is needed. session_reminder_sent_at guarantees
// at most one text per booking.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = Date.now()
  const nowISO = new Date(now).toISOString()
  const windowISO = new Date(now + 15 * 60 * 1000).toISOString() // ends within 15 min

  const { data: bookings, error } = await supabase
    .from('bookings')
    .select('id, end_time, check_in_token, customers ( name, phone ), sets ( name )')
    .eq('status', 'confirmed')
    .is('session_reminder_sent_at', null)
    .is('checked_out_at', null)
    .gt('end_time', nowISO)      // still time left — never text someone after they've left
    .lte('end_time', windowISO)  // ...but 15 min or less remaining

  if (error) {
    console.error('[session-reminder] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  let sent = 0
  for (const b of bookings ?? []) {
    const customer = Array.isArray(b.customers) ? b.customers[0] : b.customers
    const set      = Array.isArray(b.sets)      ? b.sets[0]      : b.sets
    const setName  = set?.name ?? 'the studio'

    // Claim the row first (mark sent) so an overlapping run can't double-text.
    await supabase
      .from('bookings')
      .update({ session_reminder_sent_at: new Date().toISOString() })
      .eq('id', b.id)

    const phone = toE164(customer?.phone)
    if (!phone) continue // no reachable number — already dequeued above

    const firstName = customer?.name ? customer.name.split(' ')[0] : 'there'
    const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')
    const token = (b as any).check_in_token
    const checkoutLine = token
      ? `• Check out when you're packed up: ${appUrl}/checkin/${token}`
      : `• Check out on your booking link when you're packed up`
    const body = [
      `⏰ Made Kulture — 15 minutes left, ${firstName}.`,
      ``,
      `Time to wrap up your session at ${setName}:`,
      `• Return all props to where you found them`,
      `• Take all your gear and belongings with you; dispose of any trash`,
      checkoutLine,
      ``,
      `Please wrap up on time — running over may be charged an extra hour per studio policy.`,
      `Reply STOP to opt out.`,
    ].join('\n')

    await sendSMS(phone, body) // non-fatal; logs and swallows Twilio errors
    sent++
  }

  return NextResponse.json({ sent, matched: bookings?.length ?? 0 })
}
