import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'

const last10 = (s: string) => (s || '').replace(/\D/g, '').slice(-10)

// POST /api/checkin/lookup — { phone } -> token for the booking happening now.
// Used by the door QR / kiosk so guests don't need a personal link.
export async function POST(req: NextRequest) {
  try {
    const { phone } = await req.json()
    const digits = last10(phone)
    if (digits.length !== 10) return NextResponse.json({ error: 'Enter the 10-digit phone number on your booking.' }, { status: 400 })

    // Today's active bookings (small set) — match by customer phone.
    const now = Date.now()
    const fromISO = new Date(now - 3 * 60 * 60 * 1000).toISOString()  // started up to 3h ago
    const toISO   = new Date(now + 16 * 60 * 60 * 1000).toISOString() // through later today

    const { data: rows } = await supabase
      .from('bookings')
      .select('check_in_token, start_time, status, sets ( name ), customers ( name, phone )')
      .neq('status', 'cancelled')
      .gte('start_time', fromISO)
      .lte('start_time', toISO)
      .order('start_time', { ascending: true })

    const match = (rows ?? []).find(r => last10((r.customers as any)?.phone ?? '') === digits)
    if (!match) {
      return NextResponse.json({ error: 'No booking found for that number today. Text (832) 408-1631 for help.' }, { status: 404 })
    }

    return NextResponse.json({ token: match.check_in_token })
  } catch (err) {
    console.error('[checkin/lookup] error:', err)
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 })
  }
}
