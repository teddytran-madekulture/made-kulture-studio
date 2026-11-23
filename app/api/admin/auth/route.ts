import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, clearRateLimit, setAdminCookie, verifyAdminPassword, adminSessionId, isAdminAuthed } from '@/lib/admin-auth'
import { revokeAdminSession, revokeStaffSessions, ALL_SESSIONS } from '@/lib/admin-sessions'
import { getStaffFromRequest, clearStaffCookie, clearLockedCookie } from '@/lib/staff-auth'

// POST /api/admin/auth — password login
export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? 'unknown'

  const { allowed, remaining, retryAfterMs } = checkRateLimit(ip)
  if (!allowed) {
    const mins = Math.ceil(retryAfterMs / 60_000)
    return NextResponse.json(
      { error: `Too many attempts. Try again in ${mins} minute${mins !== 1 ? 's' : ''}.` },
      { status: 429 }
    )
  }

  const { password } = await req.json()
  const valid = await verifyAdminPassword(password)
  if (!valid) {
    const msg = remaining > 0
      ? `Incorrect password. ${remaining} attempt${remaining !== 1 ? 's' : ''} remaining.`
      : 'Incorrect password.'
    return NextResponse.json({ error: msg }, { status: 401 })
  }

  clearRateLimit(ip)
  return setAdminCookie(NextResponse.json({ success: true }))
}

// DELETE /api/admin/auth        — sign out THIS session
// DELETE /api/admin/auth?all=1  — sign out EVERY admin session on every device
//
// 2026-11-23 (migration 190): logging out used to only delete the cookie in
// this browser; a copy of it kept working for up to 7 days. Now the session is
// cancelled on the server too (middleware.ts refuses it from then on).
// The cookie is ALWAYS cleared here. If the server-side cancel fails, the
// response says so (`revoked: false`) instead of pretending.
export async function DELETE(req: NextRequest) {
  const all = req.nextUrl.searchParams.get('all') === '1'
  const sid = adminSessionId(req.cookies.get('admin_auth')?.value)
  let problem: string | null = null

  if (all) {
    // Only a signed-in admin may end everyone's sessions.
    if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    problem = await revokeAdminSession(ALL_SESSIONS)
    // Signed in through a staff owner login as well? End those sessions too.
    const staff = getStaffFromRequest(req)
    if (staff) problem = (await revokeStaffSessions(staff.staffId)) || problem
  } else if (sid) {
    problem = await revokeAdminSession(sid)
  }
  if (problem) console.error('[admin/auth] logout could NOT cancel the session server-side:', problem)

  let res: NextResponse = NextResponse.json(
    problem ? { success: false, revoked: false, error: 'Signed out on this device, but the session could not be cancelled on the server. Try again.' } : { success: true, revoked: true },
    { status: problem && all ? 500 : 200 },
  )
  res.cookies.delete('admin_auth')
  if (all) { res = clearStaffCookie(res); res = clearLockedCookie(res) }
  return res
}
