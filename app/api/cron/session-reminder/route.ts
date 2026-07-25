import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendSMS, toE164 } from '@/lib/sms'
import { createExtensionRequest } from '@/lib/extensions'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/cron/session-reminder
// Runs every few minutes. Texts the customer a wrap-up reminder when their
// booking is within 15 minutes of ending — return props, pack up, check out
// before the time runs over.
//
// The text also tells them WHAT'S HAPPENING AFTER THEM, and that part can only
// live here. A confirmation text is a snapshot from 48+ hours earlier, when the
// slot after them may not have been booked yet; this runs 15 minutes before
// they finish, so it sees the real schedule either way:
//   • someone's in right after → name the time, so "wrap up" means something
//   • nobody's after them      → offer the hour, charged to the card on file
// Never both, and the offer only appears when the set is genuinely free.
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
    .select('id, set_id, end_time, customer_id, check_in_token, customers ( name, phone ), sets ( name )')
    .eq('status', 'confirmed')
    .is('session_reminder_sent_at', null)
    .is('checked_out_at', null)
    .gt('end_time', nowISO)      // still time left — never text someone after they've left
    .lte('end_time', windowISO)  // ...but 15 min or less remaining

  if (error) {
    console.error('[session-reminder] query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const centralTime = (iso: string) =>
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' })
      .format(new Date(iso))

  // Who's on this set next, if anyone. A gap of up to an hour still counts as
  // "right after you" — that's the case where running over actually hurts.
  // A full-studio buyout (set_id null) is blocked by ANY booking that follows.
  const HANDOVER_WINDOW_MS = 60 * 60 * 1000
  const nextOnSet = async (b: any) => {
    const end = new Date(b.end_time).getTime()
    let q = supabase
      .from('bookings')
      .select('id, start_time, customer_id, sets ( name )')
      .eq('status', 'confirmed')
      .neq('id', b.id)
      .gte('start_time', new Date(end - 60_000).toISOString())
      .lte('start_time', new Date(end + HANDOVER_WINDOW_MS).toISOString())
      .order('start_time', { ascending: true })
      .limit(1)
    if (b.set_id) q = q.eq('set_id', b.set_id)
    const { data } = await q
    return (data ?? [])[0] ?? null
  }

  let sent = 0, warned = 0, offered = 0
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

    // What comes next — a warning, an offer, or (rarely) neither.
    let tailLines: string[] = []
    const next = await nextOnSet(b).catch(() => null)

    if (next && next.customer_id && next.customer_id === (b as any).customer_id) {
      // Their own back-to-back booking. Not a warning — just orientation.
      const nextSet = Array.isArray(next.sets) ? (next.sets[0] as any)?.name : (next.sets as any)?.name
      tailLines = [`Your next session${nextSet ? ` (${nextSet})` : ''} starts at ${centralTime(next.start_time)}.`]
    } else if (next) {
      tailLines = [`⚠️ ${setName} is booked at ${centralTime(next.start_time)} right after you — please be packed up and out by then.`]
      warned++
    } else {
      // Nobody's waiting. Offer the hour rather than let the room sit empty —
      // the link charges the card already on file, and it's minted per booking
      // so it only ever applies to this session.
      const ext = await createExtensionRequest(b.id, 1, 45 * 60 * 1000).catch(() => null)
      if (ext && !('error' in ext)) {
        tailLines = [
          `Need more time? Nobody's booked after you — add an hour on ${setName} for $${(ext.priceCents / 100).toFixed(2)}, charged to your card on file:`,
          `${appUrl}/extend/${ext.token}`,
        ]
        offered++
      }
    }

    const body = [
      `⏰ Made Kulture — 15 minutes left, ${firstName}.`,
      ``,
      `Time to wrap up your session at ${setName}:`,
      `• Return all props to where you found them`,
      `• Take all your gear and belongings with you; dispose of any trash`,
      checkoutLine,
      ...(tailLines.length ? ['', ...tailLines] : []),
      ``,
      `Please wrap up on time — running over may be charged an extra hour per studio policy.`,
      `Reply STOP to opt out.`,
    ].join('\n')

    await sendSMS(phone, body) // non-fatal; logs and swallows Twilio errors
    sent++
  }

  return NextResponse.json({ sent, matched: bookings?.length ?? 0, warned, offered })
}
