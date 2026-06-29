import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { verifyAdminPassword } from '@/lib/admin-auth'
import { hashSecret, setStaffCookie, countStaff } from '@/lib/staff-auth'
import { audit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

// POST /api/staff/bootstrap  { adminPassword, name, email, password, pin? }
// One-time creation of the first OWNER account, authorized by the existing
// ADMIN_PASSWORD. Refuses once any staff account exists.
export async function POST(req: NextRequest) {
  let body: { adminPassword?: string; name?: string; email?: string; password?: string; pin?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  }

  if (await countStaff() > 0) {
    return NextResponse.json({ error: 'Setup already complete. Sign in instead.' }, { status: 409 })
  }
  if (!(await verifyAdminPassword(body.adminPassword ?? ''))) {
    return NextResponse.json({ error: 'Admin password is incorrect.' }, { status: 401 })
  }

  const name = (body.name ?? '').trim()
  const email = (body.email ?? '').trim().toLowerCase()
  const password = body.password ?? ''
  const pin = (body.pin ?? '').trim()
  if (!name || !email || password.length < 8) {
    return NextResponse.json({ error: 'Name, email, and a password of at least 8 characters are required.' }, { status: 400 })
  }
  if (pin && !/^\d{4,6}$/.test(pin)) {
    return NextResponse.json({ error: 'PIN must be 4–6 digits.' }, { status: 400 })
  }

  const { data, error } = await supabaseAdmin()
    .from('staff_users')
    .insert({
      name,
      email,
      role: 'owner',
      password_hash: hashSecret(password),
      pin_hash: pin ? hashSecret(pin) : null,
    })
    .select('id, name, role')
    .single()

  if (error || !data) {
    return NextResponse.json({ error: 'Could not create the owner account. Did you run migration 019?' }, { status: 500 })
  }

  const ctx = { staffId: data.id, role: 'owner' as const, name: data.name }
  await audit(ctx, 'staff.bootstrap', { entityType: 'staff', entityId: data.id, details: { email } })

  const res = NextResponse.json({ staff: { id: data.id, name: data.name, role: data.role } })
  return setStaffCookie(res, { id: data.id, role: 'owner', name: data.name })
}
