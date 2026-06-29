import { NextRequest, NextResponse } from 'next/server'
import { requireStaff } from '@/lib/staff-auth'
import { getActiveDevice } from '@/lib/square-terminal'

export const dynamic = 'force-dynamic'

// GET /api/desk/terminal/device → the active paired Register, or null.
export async function GET(req: NextRequest) {
  const g = requireStaff(req, 'payment.terminal')
  if (g instanceof NextResponse) return g
  const device = await getActiveDevice()
  return NextResponse.json({ device: device ?? null })
}
