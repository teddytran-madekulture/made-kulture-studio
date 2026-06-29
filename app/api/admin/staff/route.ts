import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireStaff, hashSecret } from '@/lib/staff-auth'
import { STAFF_ROLES, type StaffRole } from '@/lib/staff-permissions'
import { audit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

// GET /api/admin/staff — list employees (owner only).
export async function GET(req: NextRequest) {
  const g = requireStaff(req, 'staff.manage')
  if (g instanceof NextResponse) return g

  const { data, error } = await supabaseAdmin()
    .from('staff_users')
    .select('id, name, email, role, is_active, created_at, last_login_at')
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: 'Could not load staff.' }, { status: 500 })
  return NextResponse.json({ staff: data ?? [] })
}

// POST /api/admin/staff — create an employee (owner only).
// { name, email, role, password, pin? }
export async function POST(req: NextRequest) {
  const g = requireStaff(req, 'staff.manage')
  if (g instanceof NextResponse) return g

  let body: { name?: string; email?: string; role?: string; password?: string; pin?: string }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  }

  const name = (body.name ?? '').trim()
  const email = (body.email ?? '').trim().toLowerCase()
  const role = body.role as StaffRole
  const password = body.password ?? ''
  const pin = (body.pin ?? '').trim()

  if (!name || !email) return NextResponse.json({ error: 'Name and email are required.' }, { status: 400 })
  if (!STAFF_ROLES.includes(role)) return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
  if (password.length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
  if (pin && !/^\d{4,6}$/.test(pin)) return NextResponse.json({ error: 'PIN must be 4–6 digits.' }, { status: 400 })

  const { data, error } = await supabaseAdmin()
    .from('staff_users')
    .insert({
      name, email, role,
      password_hash: hashSecret(password),
      pin_hash: pin ? hashSecret(pin) : null,
    })
    .select('id, name, email, role, is_active, created_at, last_login_at')
    .single()

  if (error || !data) {
    const dupe = (error?.message ?? '').includes('duplicate') || (error as any)?.code === '23505'
    return NextResponse.json({ error: dupe ? 'That email is already in use.' : 'Could not create the employee.' }, { status: dupe ? 409 : 500 })
  }

  await audit(g, 'staff.create', { entityType: 'staff', entityId: data.id, details: { email, role } })
  return NextResponse.json({ staff: data })
}
