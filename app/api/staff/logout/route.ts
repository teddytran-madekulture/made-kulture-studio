import { NextRequest, NextResponse } from 'next/server'
import { clearStaffCookie, clearLockedCookie } from '@/lib/staff-auth'

export const dynamic = 'force-dynamic'

// POST /api/staff/logout — clears BOTH the full session and the locked cookie, so
// "sign out" from the lock screen can't be revived later with just the PIN.
export async function POST(_req: NextRequest) {
  let res = NextResponse.json({ ok: true })
  res = clearStaffCookie(res)
  res = clearLockedCookie(res)
  return res
}
