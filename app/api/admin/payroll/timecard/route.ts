import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { pushTimecard } from '@/lib/square-labor'

export const dynamic = 'force-dynamic'

// POST /api/admin/payroll/timecard — { shift_id } approve a completed shift's
// hours and write a Labor timecard to the worker's Square Team profile.
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({})) as { shift_id?: string }
  if (!b.shift_id) return NextResponse.json({ error: 'shift_id required' }, { status: 400 })
  const r = await pushTimecard(b.shift_id)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ success: true, timecardId: r.timecardId })
}
