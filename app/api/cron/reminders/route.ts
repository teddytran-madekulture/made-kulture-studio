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

  // Compute tomorrow's date in Houston time (UTC-5, close enough for daily cron)
  const now = new Date()
  const houstonOffset = -5 * 60 // minutes
  const houstonNow = new Date(now.getTime() + (houstonOffset - now.getTimezoneOffset()) * 60_000)
  const tomorrow = new Date(houstonNow)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const tomorrowStr = tomorrow.toISOString().slice(0, 10) // YYYY-MM-DD

  // Query confirmed bookings that start tomorrow
  const startOfDay = `${tomorrowStr}T00:00:00`
  const endOfDay   = `${tomorrowStr}T23:59:59`

  const { data: bookings, error } = await supabase
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
    .gte('start_time', startOfDay)
    .lte('start_time', endOfDay)

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

    const startHour = new Date(booking.start_time).getHours()
    const endHour   = new Date(booking.end_time).getHours()

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
