import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { setStaffCookie } from '@/lib/staff-auth'
import { audit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')

// GET /api/staff/auth/magic?token=xxx
// Validates a one-time reset token, signs the staff member in, and drops them on
// the staff console where they can Reset PW on their own account.
export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url)
  const raw = searchParams.get('token') ?? ''
  const fail = (msg: string) => NextResponse.redirect(`${origin}/staff?error=${encodeURIComponent(msg)}`)
  if (!raw) return fail('Invalid sign-in link.')

  const db = supabaseAdmin()
  const { data: row } = await db
    .from('staff_password_resets')
    .select('id, staff_id, expires_at, used_at')
    .eq('token_hash', sha256(raw))
    .maybeSingle()

  if (!row || row.used_at || new Date(row.expires_at) < new Date()) {
    return fail('This link has expired or was already used. Request a new one.')
  }

  // Consume it (one-time) before granting the session.
  await db.from('staff_password_resets').update({ used_at: new Date().toISOString() }).eq('id', row.id)

  const { data: staff } = await db
    .from('staff_users')
    .select('id, role, name, is_active')
    .eq('id', row.staff_id)
    .maybeSingle()
  if (!staff || !staff.is_active) return fail('This account is no longer active.')

  try {
    await audit({ staffId: staff.id, role: staff.role as any, name: staff.name }, 'staff.magic_login', {
      entityType: 'staff', entityId: staff.id,
    })
  } catch { /* non-fatal */ }

  return setStaffCookie(
    NextResponse.redirect(`${origin}/staff`),
    { id: staff.id, role: staff.role as any, name: staff.name }
  )
}
