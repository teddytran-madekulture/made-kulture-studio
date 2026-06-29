import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireStaff } from '@/lib/staff-auth'

export const dynamic = 'force-dynamic'

const SELECT = `
  id, start_time, end_time, status, notes, total_amount,
  guest_count, arrived_guest_count, checked_in_at, checked_out_at,
  customer_id,
  sets ( name ),
  customers ( name, phone, email, banned ),
  booking_add_ons ( id, quantity, rate, paid, square_order_id, equipment ( name ) )
`

// Chicago calendar date (YYYY-MM-DD) for an instant.
function chiDate(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(d)
}

// GET /api/desk/bookings?q=&scope=today|upcoming
// Default (no q): today's bookings in Houston time, soonest first.
// With q: matches customer name / phone.
export async function GET(req: NextRequest) {
  const g = requireStaff(req, 'booking.view')
  if (g instanceof NextResponse) return g

  const url = new URL(req.url)
  const q = (url.searchParams.get('q') ?? '').trim()
  const scope = url.searchParams.get('scope') ?? 'today'
  const db = supabaseAdmin()

  // ── Search path ──────────────────────────────────────────────────────────
  if (q) {
    const digits = q.replace(/\D/g, '')
    const { data: custs } = await db
      .from('customers')
      .select('id')
      .or(`name.ilike.%${q}%${digits ? `,phone.ilike.%${digits}%` : ''}`)
      .limit(50)
    const customerIds = (custs ?? []).map(c => c.id)
    if (customerIds.length === 0) return NextResponse.json({ bookings: [] })

    const { data, error } = await db
      .from('bookings')
      .select(SELECT)
      .in('customer_id', customerIds)
      .order('start_time', { ascending: false })
      .limit(50)
    if (error) return NextResponse.json({ error: 'Search failed.' }, { status: 500 })
    return NextResponse.json({ bookings: data ?? [] })
  }

  // ── Today / upcoming path ────────────────────────────────────────────────
  // Pull a generous window, then filter to the Houston calendar day in JS
  // (DST-safe). Upcoming = today through +14 days.
  const now = Date.now()
  const lo = new Date(now - 18 * 3600_000).toISOString()
  const hi = new Date(now + (scope === 'upcoming' ? 15 : 2) * 86400_000).toISOString()

  const { data, error } = await db
    .from('bookings')
    .select(SELECT)
    .neq('status', 'cancelled')
    .gte('start_time', lo)
    .lte('start_time', hi)
    .order('start_time', { ascending: true })
  if (error) return NextResponse.json({ error: 'Could not load bookings.' }, { status: 500 })

  let bookings = data ?? []
  if (scope !== 'upcoming') {
    const today = chiDate(new Date())
    bookings = bookings.filter(b => chiDate(new Date(b.start_time)) === today)
  }
  return NextResponse.json({ bookings })
}
