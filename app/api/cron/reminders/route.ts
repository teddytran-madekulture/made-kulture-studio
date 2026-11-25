import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendBookingReminder, formatTimeLabel, formatDateLabel } from '@/lib/email'
import { sendSMSResult } from '@/lib/sms'
import { sendOwnerPush } from '@/lib/push'
import { reminderText } from '@/lib/reminder-text'
import { confirmTextAtBooking } from '@/lib/booking-times'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/cron/reminders
// Called nightly by Vercel Cron. Sends 24-hour reminder emails for all
// confirmed bookings starting tomorrow (Houston time, UTC-5/CDT UTC-6).
export async function GET(req: NextRequest) {
  // Verify the request is from Vercel Cron (or an authorized caller)
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // "Tomorrow" must be computed in HOUSTON time, and bookings bucketed by their
  // Houston-local calendar date — not UTC. (A 7pm CT booking is already the next
  // day in UTC, which used to make today's evening bookings get "tomorrow"
  // reminders with UTC clock times like 12am–2am.)
  const centralDateStr = (d: Date | string): string =>
    new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date(d))
  const centralHourDecimal = (iso: string): number => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(new Date(iso))
    const hh = Number(parts.find(p => p.type === 'hour')?.value ?? 0)
    const mm = Number(parts.find(p => p.type === 'minute')?.value ?? 0)
    return (hh % 24) + (mm >= 30 ? 0.5 : 0)
  }

  const todayCentral = centralDateStr(new Date())
  const tomorrowStr = new Date(Date.parse(`${todayCentral}T12:00:00Z`) + 86_400_000)
    .toISOString().slice(0, 10) // YYYY-MM-DD, Houston's tomorrow

  // Query a generous UTC superset of Houston's tomorrow (covers CST & CDT),
  // then keep only rows whose Houston-local date is exactly tomorrow.
  // 2026-11-24 FIX: these offsets were the wrong way round. -07:00 on the START
  // pushed it LATER (07:00 UTC) and +01:00 on the END pulled it EARLIER (22:59 UTC),
  // so every booking starting after ~5 PM Central (6 PM in summer) was left out.
  // The Houston day runs ~05:00-06:00 UTC to the same next day; this window covers it.
  const windowStart = `${tomorrowStr}T00:00:00+00:00`
  const windowEnd   = `${tomorrowStr}T23:59:59-07:00`

  const { data: rawBookings, error } = await supabase
    .from('bookings')
    .select(`
      id,
      start_time,
      end_time,
      created_at,
      total_amount,
      notes,
      check_in_token,
      sets ( name ),
      customers ( name, email, phone )
    `)
    .eq('status', 'confirmed')
    .gte('start_time', windowStart)
    .lte('start_time', windowEnd)

  const bookings = (rawBookings ?? []).filter(b => centralDateStr(b.start_time) === tomorrowStr)

  if (error) {
    console.error('Cron reminders query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // No early return on an empty list: an empty result is exactly what a broken
  // window looks like, so the cross-check below must still run.

  let sent = 0
  let texted = 0
  const errors: string[] = []
  // 2026-11-24 SELF-CHECK: who did NOT get reached, and why. Evening bookings
  // went months without a reminder and nothing said so; this is what says so.
  const missed: { name: string; when: string; why: string }[] = []
  const whenOf = (b: any) => `${(Array.isArray(b.sets) ? b.sets[0] : b.sets)?.name ?? 'Full studio'} ${formatTimeLabel(centralHourDecimal(b.start_time))}`

  for (const booking of bookings) {
    const customer = Array.isArray(booking.customers) ? booking.customers[0] : booking.customers
    const set      = Array.isArray(booking.sets)      ? booking.sets[0]      : booking.sets

    const startHour = centralHourDecimal(booking.start_time)
    const endHour   = centralHourDecimal(booking.end_time)

    // Day-before TEXT (2026-10-02). Booking confirms by email; this is the
    // text, with the check-in link, the way Acuity customers were used to.
    // Consent: checkout's "booking confirmations, reminders and door codes"
    // checkbox. Plain text only — lib/sms strips anything outside GSM-7.
    // Skip the text if this booking already got one AT BOOKING time -- the same
    // rule booking-core / api/bookings used, replayed at created_at. Without
    // this, booking tomorrow's session between noon and the run (or anywhere in
    // Hobby cron's up-to-59-min drift) texted the customer twice.
    const textedAtBooking = !!(booking as any).created_at &&
      confirmTextAtBooking(booking.start_time, new Date((booking as any).created_at))
    const phone = (customer as any)?.phone as string | undefined
    if (phone && !textedAtBooking) {
      const msg = reminderText({
        name: customer?.name, setName: set?.name, startISO: booking.start_time, endISO: booking.end_time,
        checkInToken: (booking as any).check_in_token,
      })
      let ok = false
      try { const r = await sendSMSResult(phone, msg); ok = r.ok; if (!r.ok) console.error(`Reminder text failed for booking ${booking.id}:`, r.error) }
      catch (err) { console.error(`Reminder text failed for booking ${booking.id}:`, err) }
      if (ok) texted++
      else missed.push({ name: customer?.name ?? 'Guest', when: whenOf(booking), why: 'text failed' })
    }

    if (!customer?.email || !customer?.name) {
      if (!phone) missed.push({ name: customer?.name ?? 'Guest', when: whenOf(booking), why: 'no phone or email on file' })
      continue
    }

    try {
      await sendBookingReminder({
        customerName:  customer.name,
        customerEmail: customer.email,
        setName:       set?.name ?? 'Full Studio Buyout',
        date:          formatDateLabel(tomorrowStr),
        startTime:     formatTimeLabel(startHour),
        endTime:       formatTimeLabel(endHour),
        totalAmount:   booking.total_amount ?? 0,
        bookingId:     booking.id,
        checkInToken:  (booking as any).check_in_token,
      })
      sent++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`Reminder failed for booking ${booking.id}:`, msg)
      errors.push(`${booking.id}: ${msg}`)
      if (!phone || textedAtBooking) missed.push({ name: customer.name, when: whenOf(booking), why: 'email failed' })
    }
  }

  // Cross-check with a query that shares NOTHING with the one above: every
  // confirmed booking starting in the next 48 hours, filtered to tomorrow in
  // Houston time. If the main query's window is ever wrong again, the two lists
  // disagree and this says who was left out.
  const seen = new Set(bookings.map((b: any) => b.id))
  const { data: check, error: checkErr } = await supabase
    .from('bookings').select('id, start_time, sets ( name ), customers ( name )')
    .eq('status', 'confirmed')
    .gte('start_time', new Date().toISOString())
    .lte('start_time', new Date(Date.now() + 48 * 3600_000).toISOString())
  if (checkErr) console.error('[reminders] cross-check failed:', checkErr.message)
  for (const b of (check ?? []).filter((x: any) => centralDateStr(x.start_time) === tomorrowStr && !seen.has(x.id))) {
    const c = Array.isArray((b as any).customers) ? (b as any).customers[0] : (b as any).customers
    missed.push({ name: c?.name ?? 'Guest', when: whenOf(b), why: 'left out of the reminder run' })
  }

  if (missed.length || checkErr) {
    const lines = missed.slice(0, 6).map(m => `${m.name} (${m.when}): ${m.why}`)
    if (missed.length > 6) lines.push(`+${missed.length - 6} more`)
    if (checkErr) lines.push('The cross-check itself failed, so the list may be incomplete.')
    try {
      await sendOwnerPush({
        title: `Reminders: ${missed.length} for tomorrow not sent`,
        body: lines.join('\n').slice(0, 400),
        url: '/admin/dashboard',
        tag: `reminders-${tomorrowStr}`,
        requireInteraction: true,
      })
    } catch (e) { console.error('[reminders] owner push failed:', e) }
  }

  return NextResponse.json({
    sent,
    texted,
    total: bookings.length,
    missed: missed.length ? missed : undefined,
    errors: errors.length > 0 ? errors : undefined,
    date: tomorrowStr,
  })
}
