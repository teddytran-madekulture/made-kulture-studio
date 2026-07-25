import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { getCoverageBlocks } from '@/lib/booking-shifts'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/admin/staffing/bookings — upcoming bookings merged into coverage blocks
// (overlapping / within an hour) so one shift covers a natural stretch, with each
// block's staffed status.
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ blocks: await getCoverageBlocks() })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load bookings.' }, { status: 500 })
  }
}
