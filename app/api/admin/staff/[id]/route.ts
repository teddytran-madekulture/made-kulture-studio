import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireStaff, hashSecret } from '@/lib/staff-auth'
import { STAFF_ROLES, type StaffRole } from '@/lib/staff-permissions'
import { audit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

// Guard: never allow removing/demoting the last active owner (lockout protection).
async function wouldOrphanOwners(targetId: string, opts: { demoting?: boolean; deactivating?: boolean }): Promise<boolean> {
  if (!opts.demoting && !opts.deactivating) return false
  const { data } = await supabaseAdmin()
    .from('staff_users')
    .select('id')
    .eq('role', 'owner')
    .eq('is_active', true)
  const ownerIds = (data ?? []).map(o => o.id)
  return ownerIds.length <= 1 && ownerIds.includes(targetId)
}

// PATCH /api/admin/staff/[id] — update name / email / role / active / password / pin (owner only).
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const g = requireStaff(req, 'staff.manage')
  if (g instanceof NextResponse) return g

  let body: { name?: string; email?: string; role?: string; is_active?: boolean; password?: string; pin?: string | null }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Bad request.' }, { status: 400 })
  }

  const update: Record<string, unknown> = {}

  if (body.name !== undefined) {
    if (!body.name.trim()) return NextResponse.json({ error: 'Name can’t be empty.' }, { status: 400 })
    update.name = body.name.trim()
  }

  if (body.email !== undefined) {
    const email = body.email.trim().toLowerCase()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return NextResponse.json({ error: 'Enter a valid email.' }, { status: 400 })
    update.email = email
  }

  if (body.role !== undefined) {
    if (!STAFF_ROLES.includes(body.role as StaffRole)) return NextResponse.json({ error: 'Invalid role.' }, { status: 400 })
    if (body.role !== 'owner' && await wouldOrphanOwners(params.id, { demoting: true })) {
      return NextResponse.json({ error: 'Can’t demote the only owner.' }, { status: 400 })
    }
    update.role = body.role
  }

  if (body.is_active !== undefined) {
    if (body.is_active === false && await wouldOrphanOwners(params.id, { deactivating: true })) {
      return NextResponse.json({ error: 'Can’t deactivate the only owner.' }, { status: 400 })
    }
    update.is_active = body.is_active
  }

  if (body.password !== undefined) {
    if ((body.password ?? '').length < 8) return NextResponse.json({ error: 'Password must be at least 8 characters.' }, { status: 400 })
    update.password_hash = hashSecret(body.password)
  }

  if (body.pin !== undefined) {
    if (body.pin === null || body.pin === '') {
      update.pin_hash = null
    } else if (/^\d{4,6}$/.test(body.pin)) {
      update.pin_hash = hashSecret(body.pin)
    } else {
      return NextResponse.json({ error: 'PIN must be 4–6 digits.' }, { status: 400 })
    }
  }

  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })

  const { data, error } = await supabaseAdmin()
    .from('staff_users')
    .update(update)
    .eq('id', params.id)
    .select('id, name, email, role, is_active, created_at, last_login_at')
    .single()

  if (error || !data) {
    const dupe = (error?.message ?? '').includes('duplicate') || (error as any)?.code === '23505'
    return NextResponse.json({ error: dupe ? 'That email is already in use.' : 'Could not update the employee.' }, { status: dupe ? 409 : 500 })
  }

  const changed = Object.keys(update).map(k => (k === 'password_hash' ? 'password' : k === 'pin_hash' ? 'pin' : k))
  await audit(g, 'staff.update', { entityType: 'staff', entityId: params.id, details: { changed } })
  return NextResponse.json({ staff: data })
}

// DELETE /api/admin/staff/[id] — deactivate (we never hard-delete, to preserve audit history).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const g = requireStaff(req, 'staff.manage')
  if (g instanceof NextResponse) return g

  if (await wouldOrphanOwners(params.id, { deactivating: true })) {
    return NextResponse.json({ error: 'Can’t deactivate the only owner.' }, { status: 400 })
  }

  const { error } = await supabaseAdmin().from('staff_users').update({ is_active: false }).eq('id', params.id)
  if (error) return NextResponse.json({ error: 'Could not deactivate the employee.' }, { status: 500 })
  await audit(g, 'staff.deactivate', { entityType: 'staff', entityId: params.id })
  return NextResponse.json({ ok: true })
}
