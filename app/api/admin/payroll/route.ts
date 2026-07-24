import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { getPayrollOverview, setPayrollClassEnabled } from '@/lib/square-labor'
import { WORKER_CLASSES, type WorkerClass } from '@/lib/onboarding'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/admin/payroll — Square-configured flag, per-class toggles, and the
// queue of completed shifts (worked hours) ready to push to Square.
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json(await getPayrollOverview())
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load payroll.' }, { status: 500 })
  }
}

// PATCH /api/admin/payroll — { worker_class, enabled } toggle payroll for a class.
export async function PATCH(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({})) as { worker_class?: string; enabled?: boolean }
  if (!b.worker_class || !WORKER_CLASSES.includes(b.worker_class as WorkerClass)) {
    return NextResponse.json({ error: 'Valid worker_class required.' }, { status: 400 })
  }
  await setPayrollClassEnabled(b.worker_class as WorkerClass, !!b.enabled)
  return NextResponse.json({ success: true })
}
