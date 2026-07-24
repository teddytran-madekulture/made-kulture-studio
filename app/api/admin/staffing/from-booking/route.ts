import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createShiftFromBooking } from '@/lib/booking-shifts'
import { WORKER_CLASSES, type WorkerClass } from '@/lib/onboarding'

export const dynamic = 'force-dynamic'

// POST /api/admin/staffing/from-booking — { booking_id, worker_class?, notes? }
// Posts an OPEN shift matching the booking's window (dedupes per booking).
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({})) as { booking_id?: string; worker_class?: string; notes?: string }
  if (!b.booking_id) return NextResponse.json({ error: 'booking_id required' }, { status: 400 })
  const cls = (b.worker_class && WORKER_CLASSES.includes(b.worker_class as WorkerClass)) ? b.worker_class as WorkerClass : 'attendant'
  const r = await createShiftFromBooking(b.booking_id, cls, b.notes)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ success: true, id: r.id })
}
