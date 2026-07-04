import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getLockedStaff, getStaffFromRequest, verifySecret, setStaffCookie, clearLockedCookie } from '@/lib/staff-auth'

export const dynamic = 'force-dynamic'

// POST /api/staff/unlock  { pin }
// Restore a suspended (idle-locked) session by re-entering the quick-unlock PIN.
// Identity comes from the locked cookie (idle lock) — falling back to a still-live
// full session for backward compatibility. On success, the full session is
// re-issued and the locked cookie cleared.
export async function POST(req: NextRequest) {
  const staff = getLockedStaff(req) ?? getStaffFromRequest(req)
  if (!staff) return NextResponse.json({ error: 'Session expired — sign in again.' }, { status: 401 })

  let body: { pin?: string }
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }) }
  const pin = (body.pin ?? '').trim()
  if (!pin) return NextResponse.json({ error: 'Enter your PIN.' }, { status: 400 })

  const { data } = await supabaseAdmin()
    .from('staff_users').select('pin_hash, role, name, is_active').eq('id', staff.staffId).maybeSingle()
  if (!data?.is_active) {
    return NextResponse.json({ error: 'This account is no longer active.' }, { status: 403 })
  }
  if (!data?.pin_hash) {
    return NextResponse.json({ error: 'No PIN set on your account — sign out and back in, or set one in the staff console.' }, { status: 400 })
  }
  if (!verifySecret(pin, data.pin_hash)) {
    return NextResponse.json({ error: 'Wrong PIN.' }, { status: 401 })
  }

  // Correct PIN → restore the full session, drop the locked cookie.
  let res = NextResponse.json({ ok: true })
  res = clearLockedCookie(res)
  res = setStaffCookie(res, { id: staff.staffId, role: (data.role ?? staff.role) as any, name: data.name ?? staff.name })
  return res
}
