import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { getStaffableBookings } from '@/lib/booking-shifts'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/admin/staffing/bookings — upcoming non-cancelled bookings and whether
// each already has a shift posted, so the studio can staff straight from the
// booking calendar.
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ bookings: await getStaffableBookings() })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load bookings.' }, { status: 500 })
  }
}
