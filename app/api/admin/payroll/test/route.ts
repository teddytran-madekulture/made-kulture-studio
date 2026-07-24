import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { testSquareLabor } from '@/lib/square-labor'

export const dynamic = 'force-dynamic'

// POST /api/admin/payroll/test — confirm the live Square token has Team + Labor
// permissions (the one scope check that can't be done from outside Vercel).
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await testSquareLabor())
}
