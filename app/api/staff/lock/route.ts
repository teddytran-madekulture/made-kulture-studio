import { NextRequest, NextResponse } from 'next/server'
import { getStaffFromRequest, clearStaffCookie, setLockedCookie } from '@/lib/staff-auth'

export const dynamic = 'force-dynamic'

// POST /api/staff/lock
// Suspends the staff session: clears the full session cookie and sets an
// identity-only "locked" cookie. After this, every page sees no session — so a
// URL change (e.g. /desk → /staff) can't walk around the lock. The PIN unlock
// restores the full session.
export async function POST(req: NextRequest) {
  const staff = getStaffFromRequest(req)
  if (!staff) return NextResponse.json({ ok: true }) // already no full session

  let res = NextResponse.json({ ok: true })
  res = clearStaffCookie(res)
  res = setLockedCookie(res, { id: staff.staffId, role: staff.role, name: staff.name })
  return res
}
