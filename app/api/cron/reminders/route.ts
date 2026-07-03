import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { sendBookingReminder, formatTimeLabel, formatDateLabel } from '@/lib/email'

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
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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
  const windowStart = `${tomorrowStr}T00:00:00-07:00`
  const windowEnd   = `${tomorrowStr}T23:59:59+01:00`

  const { data: rawBookings, error } = await supabase
    .from('bookings')
    .select(`
      id,
      start_time,
      end_time,
      total_amount,
      notes,
      sets ( name ),
      customers ( name, email )
    `)
    .eq('status', 'confirmed')
    .gte('start_time', windowStart)
    .lte('start_time', windowEnd)

  const bookings = (rawBookings ?? []).filter(b => centralDateStr(b.start_time) === tomorrowStr)

  if (error) {
    console.error('Cron reminders query error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!bookings || bookings.length === 0) {
    return NextResponse.json({ sent: 0, message: 'No bookings tomorrow' })
  }

  let sent = 0
  const errors: string[] = []

  for (const booking of bookings) {
    const customer = Array.isArray(booking.customers) ? booking.customers[0] : booking.customers
    const set      = Array.isArray(booking.sets)      ? booking.sets[0]      : booking.sets

    if (!customer?.email || !customer?.name) continue

    const startHour = centralHourDecimal(booking.start_time)
    const endHour   = centralHourDecimal(booking.end_time)

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
      })
      sent++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.error(`Reminder failed for booking ${booking.id}:`, msg)
      errors.push(`${booking.id}: ${msg}`)
    }
  }

  return NextResponse.json({
    sent,
    total: bookings.length,
    errors: errors.length > 0 ? errors : undefined,
    date: tomorrowStr,
  })
}
