import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { provisionTeamMember } from '@/lib/square-labor'

export const dynamic = 'force-dynamic'

// POST /api/admin/payroll/provision — { worker_id } create/link the worker's
// Square Team member (gated on the class being payroll-enabled).
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({})) as { worker_id?: string }
  if (!b.worker_id) return NextResponse.json({ error: 'worker_id required' }, { status: 400 })
  const r = await provisionTeamMember(b.worker_id)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ success: true, teamMemberId: r.teamMemberId })
}
