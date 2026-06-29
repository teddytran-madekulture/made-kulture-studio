import { NextRequest, NextResponse } from 'next/server'
import { clearStaffCookie } from '@/lib/staff-auth'

export const dynamic = 'force-dynamic'

// POST /api/staff/logout — clears the staff session cookie.
export async function POST(_req: NextRequest) {
  return clearStaffCookie(NextResponse.json({ ok: true }))
}
