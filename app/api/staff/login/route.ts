import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { findActiveStaffByEmail, verifySecret, setStaffCookie } from '@/lib/staff-auth'
import type { StaffRole } from '@/lib/staff-permissions'
import { audit } from '@/lib/audit'
import { staffAuthLocked, recordStaffAuthFailure, STAFF_LOCKED_MSG } from '@/lib/staff-lockout'

export const dynamic = 'force-dynamic'

// POST /api/staff/login  { email, password }
export async function POST(req: NextRequest) {
  let body: { email?: string; password?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  }
  const email = (body.email ?? '').trim()
  const password = body.password ?? ''
  if (!email || !password) {
    return NextResponse.json({ error: 'Email and password are required.' }, { status: 400 })
  }

  // DB-backed lockout per email (2026-10-06) — see lib/staff-lockout.ts.
  const target = email.toLowerCase()
  if (await staffAuthLocked(target)) return NextResponse.json({ error: STAFF_LOCKED_MSG }, { status: 429 })

  const staff = await findActiveStaffByEmail(email)
  // Same generic message whether the email is unknown or the password is wrong.
  if (!staff || !verifySecret(password, staff.password_hash)) {
    await recordStaffAuthFailure(target, 'login')
    return NextResponse.json({ error: 'Incorrect email or password.' }, { status: 401 })
  }

  await supabaseAdmin()
    .from('staff_users')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', staff.id)

  const ctx = { staffId: staff.id, role: staff.role as StaffRole, name: staff.name }
  await audit(ctx, 'staff.login', { entityType: 'staff', entityId: staff.id })

  const res = NextResponse.json({
    staff: { id: staff.id, name: staff.name, role: staff.role },
  })
  return setStaffCookie(res, { id: staff.id, role: staff.role as StaffRole, name: staff.name })
}
