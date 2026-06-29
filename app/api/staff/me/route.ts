import { NextRequest, NextResponse } from 'next/server'
import { getStaffFromRequest, countStaff } from '@/lib/staff-auth'
import { PERMISSIONS, can, type Permission } from '@/lib/staff-permissions'

export const dynamic = 'force-dynamic'

// GET /api/staff/me
// - If no staff accounts exist yet → { needsBootstrap: true } (first-run setup).
// - If signed in → the current staff + a map of their permissions.
// - Otherwise → { staff: null }.
export async function GET(req: NextRequest) {
  const staff = getStaffFromRequest(req)
  if (!staff) {
    const total = await countStaff()
    if (total === 0) return NextResponse.json({ needsBootstrap: true, staff: null })
    return NextResponse.json({ staff: null })
  }

  const perms: Record<string, boolean> = {}
  for (const p of Object.keys(PERMISSIONS) as Permission[]) perms[p] = can(staff.role, p)

  return NextResponse.json({
    staff: { id: staff.staffId, name: staff.name, role: staff.role },
    permissions: perms,
  })
}
