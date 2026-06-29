import { NextRequest, NextResponse } from 'next/server'
import { createHmac, randomBytes, scryptSync, timingSafeEqual } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { can, type Permission, type StaffRole } from '@/lib/staff-permissions'

// ── Password / PIN hashing (Node scrypt — no external dependency) ──────────────
// Stored format: "<saltHex>:<hashHex>". Per-secret random salt.

export function hashSecret(plain: string): string {
  const salt = randomBytes(16)
  const hash = scryptSync(plain, salt, 64)
  return `${salt.toString('hex')}:${hash.toString('hex')}`
}

export function verifySecret(plain: string, stored: string | null | undefined): boolean {
  if (!stored) return false
  const [saltHex, hashHex] = stored.split(':')
  if (!saltHex || !hashHex) return false
  try {
    const salt = Buffer.from(saltHex, 'hex')
    const expected = Buffer.from(hashHex, 'hex')
    const actual = scryptSync(plain, salt, expected.length)
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}

// ── Session cookie (signed, carries identity) ──────────────────────────────────
// Cookie value: base64url(JSON payload) + "." + HMAC-SHA256(payload). The payload
// holds the staff id, role, name and issued-at. Signed with SESSION_SECRET so it
// can't be forged client-side. Mirrors the admin-auth signing approach.

const COOKIE_NAME = 'mk_staff'
const MAX_AGE_SECONDS = 60 * 60 * 12 // a 12-hour shift

type StaffSession = { sid: string; role: StaffRole; name: string; iat: number }

function signingKey(): string {
  const secret = process.env.SESSION_SECRET ?? process.env.ADMIN_PASSWORD ?? 'dev-fallback'
  return createHmac('sha256', secret).update('made-kulture-staff-cookie-v1').digest('hex')
}

function b64url(buf: Buffer): string {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function signSession(payload: StaffSession): string {
  const body = b64url(Buffer.from(JSON.stringify(payload)))
  const sig = createHmac('sha256', signingKey()).update(body).digest('hex')
  return `${body}.${sig}`
}

function verifySession(token: string | undefined): StaffSession | null {
  if (!token) return null
  const dot = token.indexOf('.')
  if (dot === -1) return null
  const body = token.slice(0, dot)
  const sig = token.slice(dot + 1)
  try {
    const expected = createHmac('sha256', signingKey()).update(body).digest('hex')
    const a = Buffer.from(sig, 'hex')
    const b = Buffer.from(expected, 'hex')
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null
    const json = Buffer.from(body.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString()
    const payload = JSON.parse(json) as StaffSession
    if (!payload?.sid || !payload?.role) return null
    if (Date.now() / 1000 - payload.iat > MAX_AGE_SECONDS) return null // expired
    return payload
  } catch {
    return null
  }
}

export function setStaffCookie(res: NextResponse, staff: { id: string; role: StaffRole; name: string }): NextResponse {
  const token = signSession({ sid: staff.id, role: staff.role, name: staff.name, iat: Math.floor(Date.now() / 1000) })
  res.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: MAX_AGE_SECONDS,
    path: '/',
  })
  return res
}

export function clearStaffCookie(res: NextResponse): NextResponse {
  res.cookies.set(COOKIE_NAME, '', { httpOnly: true, path: '/', maxAge: 0 })
  return res
}

export type StaffContext = { staffId: string; role: StaffRole; name: string }

// Read + verify the staff session from the request cookie.
export function getStaffFromRequest(req: NextRequest): StaffContext | null {
  const session = verifySession(req.cookies.get(COOKIE_NAME)?.value)
  if (!session) return null
  return { staffId: session.sid, role: session.role, name: session.name }
}

// Guard for API routes. Returns the staff context, or a NextResponse error to
// return immediately. Usage:
//   const g = requireStaff(req, 'payment.refund')
//   if (g instanceof NextResponse) return g
//   const staff = g
export function requireStaff(req: NextRequest, perm?: Permission): StaffContext | NextResponse {
  const staff = getStaffFromRequest(req)
  if (!staff) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 })
  if (perm && !can(staff.role, perm)) {
    return NextResponse.json({ error: 'You don’t have permission to do that.' }, { status: 403 })
  }
  return staff
}

// ── Lookups used by the login + bootstrap routes ───────────────────────────────

export async function findActiveStaffByEmail(email: string) {
  const { data } = await supabaseAdmin()
    .from('staff_users')
    .select('id, email, name, role, password_hash, pin_hash, is_active')
    .eq('email', email.toLowerCase().trim())
    .eq('is_active', true)
    .maybeSingle()
  return data
}

export async function countStaff(): Promise<number> {
  // Use a plain select (same pattern the staff list uses, proven to work via the
  // service role) instead of a head+count query — the latter was returning null
  // on this stack, making the app think there were zero staff and showing the
  // first-run setup screen after logout. On error, fail SAFE: assume accounts
  // exist so the bootstrap form is never wrongly offered.
  const { data, error } = await supabaseAdmin().from('staff_users').select('id')
  if (error) {
    console.error('[countStaff] failed', error)
    return 1
  }
  return data?.length ?? 0
}
