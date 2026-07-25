import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createShiftForWindow } from '@/lib/booking-shifts'
import { WORKER_CLASSES, type WorkerClass } from '@/lib/onboarding'

export const dynamic = 'force-dynamic'

// POST /api/admin/staffing/from-block — { starts_at, ends_at, worker_class?, notes? }
// Posts one OPEN shift covering a coverage block's window (overlap-guarded).
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({})) as { starts_at?: string; ends_at?: string; worker_class?: string; notes?: string }
  if (!b.starts_at || !b.ends_at) return NextResponse.json({ error: 'starts_at and ends_at required' }, { status: 400 })
  const cls = (b.worker_class && WORKER_CLASSES.includes(b.worker_class as WorkerClass)) ? b.worker_class as WorkerClass : 'attendant'
  const r = await createShiftForWindow(b.starts_at, b.ends_at, cls, b.notes)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ success: true, id: r.id })
}
