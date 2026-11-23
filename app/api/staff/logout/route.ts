import { NextRequest, NextResponse } from 'next/server'
import { clearStaffCookie, clearLockedCookie, getStaffFromRequest, getLockedStaff } from '@/lib/staff-auth'
import { revokeStaffSessions } from '@/lib/admin-sessions'

export const dynamic = 'force-dynamic'

// POST /api/staff/logout — clears BOTH the full session and the locked cookie, so
// "sign out" from the lock screen can't be revived later with just the PIN.
// 2026-11-23 (migration 190): also refuses every session this person holds on
// the SERVER, so a copied cookie stops working too. The cookies are cleared
// either way; a failed server-side cancel is logged, never hidden.
export async function POST(req: NextRequest) {
  const staff = getStaffFromRequest(req) ?? getLockedStaff(req)
  if (staff) {
    const problem = await revokeStaffSessions(staff.staffId)
    if (problem) console.error('[staff/logout] could NOT cancel sessions server-side:', problem)
  }
  let res: NextResponse = NextResponse.json({ ok: true })
  res = clearStaffCookie(res)
  res = clearLockedCookie(res)
  return res
}
