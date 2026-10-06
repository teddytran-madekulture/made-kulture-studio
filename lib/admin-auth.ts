import { NextRequest, NextResponse } from 'next/server'
import { createHmac, randomUUID, timingSafeEqual } from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { getStaffFromRequest } from '@/lib/staff-auth'
import { can } from '@/lib/staff-permissions'

// ── Supabase (service role — for password overrides stored in admin_config) ────
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Hashes a password with a fixed pepper for storage in Supabase
function hashPassword(pw: string): string {
  return createHmac('sha256', 'made-kulture-pw-v1').update(pw).digest('hex')
}

// ── Password verification (Supabase override → env var fallback) ───────────────
export async function verifyAdminPassword(pw: string): Promise<boolean> {
  try {
    const { data } = await getSupabase()
      .from('admin_config')
      .select('value')
      .eq('key', 'admin_password_hash')
      .single()
    if (data?.value) return hashPassword(pw) === data.value
  } catch {}
  // Fall back to plain env var comparison
  return pw === process.env.ADMIN_PASSWORD
}

// ── Change password (writes hash to Supabase admin_config) ────────────────────
export async function changeAdminPassword(
  currentPw: string, newPw: string
): Promise<{ success: boolean; error?: string }> {
  const valid = await verifyAdminPassword(currentPw)
  if (!valid) return { success: false, error: 'Current password is incorrect.' }
  try {
    const { error } = await getSupabase().from('admin_config').upsert({
      key: 'admin_password_hash',
      value: hashPassword(newPw),
      updated_at: new Date().toISOString(),
    })
    if (error) throw error
    return { success: true }
  } catch {
    return { success: false, error: 'Could not save new password — run the admin_config migration in Supabase first.' }
  }
}

// ── Signing key ────────────────────────────────────────────────────────────────
// Uses SESSION_SECRET if set, otherwise falls back to ADMIN_PASSWORD.
// Kept separate from the login password so changing the password doesn't
// invalidate active sessions.
function signingKey(): string {
  const secret = process.env.SESSION_SECRET ?? process.env.ADMIN_PASSWORD
  // 2026-10-06: never fall back to a constant from the source — a cookie
  // signed with a public string is a cookie anyone can forge. No secret =
  // no admin sessions at all, loudly.
  if (!secret) throw new Error('SESSION_SECRET (or ADMIN_PASSWORD) is not set — admin sessions cannot be signed')
  return createHmac('sha256', secret).update('made-kulture-admin-cookie-v1').digest('hex')
}

// How long a signed admin cookie stays valid on the SERVER. The browser's
// maxAge is only a hint; before 2026-10-06 the token had no timestamp, so a
// leaked cookie value was an admin credential until SESSION_SECRET rotated.
const ADMIN_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

// ── Session token (replaces storing the raw password in the cookie) ────────────

export function generateAdminToken(): string {
  const id  = randomUUID()
  const iat = Date.now().toString(36)
  const sig = createHmac('sha256', signingKey()).update(`${id}.${iat}`).digest('hex')
  return `${id}.${iat}.${sig}`
}

export function verifyAdminToken(token: string): boolean {
  try {
    // id.iat.sig — a two-part token from before 2026-10-06 has no issued-at
    // and is refused (one re-login, then it's never a concern again).
    const parts = token.split('.')
    if (parts.length !== 3) return false
    const [id, iat, sig] = parts
    const issued = parseInt(iat, 36)
    if (!Number.isFinite(issued) || Date.now() - issued > ADMIN_TOKEN_TTL_MS) return false
    const expected = createHmac('sha256', signingKey()).update(`${id}.${iat}`).digest('hex')
    const a = Buffer.from(sig,      'hex')
    const b = Buffer.from(expected, 'hex')
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function isAdminAuthed(req: NextRequest): boolean {
  // (a) Legacy shared-password admin cookie (unchanged — backward compatible).
  const token = req.cookies.get('admin_auth')?.value
  if (token && verifyAdminToken(token)) return true
  // (b) Signed-in staff with admin access (owner). Lets the staff login double
  //     as the admin login so /admin uses real per-user identity + the audit log.
  const staff = getStaffFromRequest(req)
  if (staff && can(staff.role, 'admin.access')) return true
  return false
}

export function setAdminCookie(res: NextResponse): NextResponse {
  res.cookies.set('admin_auth', generateAdminToken(), {
    httpOnly: true,
    secure:   process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge:   60 * 60 * 24 * 7, // 7 days
    path:     '/',
  })
  return res
}

// ── Rate limiting (per-IP, in-memory) ─────────────────────────────────────────
// Works well for a single-admin setup. Vercel may spin up multiple instances
// so the limit is per-instance, but still blocks most brute-force attempts.

const MAX_ATTEMPTS  = 5
const WINDOW_MS     = 15 * 60 * 1000 // 15 min
const ipAttempts    = new Map<string, { count: number; resetAt: number }>()

export function checkRateLimit(ip: string): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const now   = Date.now()
  const entry = ipAttempts.get(ip)

  if (!entry || entry.resetAt < now) {
    ipAttempts.set(ip, { count: 1, resetAt: now + WINDOW_MS })
    return { allowed: true, remaining: MAX_ATTEMPTS - 1, retryAfterMs: 0 }
  }

  if (entry.count >= MAX_ATTEMPTS) {
    return { allowed: false, remaining: 0, retryAfterMs: entry.resetAt - now }
  }

  entry.count++
  return { allowed: true, remaining: MAX_ATTEMPTS - entry.count, retryAfterMs: 0 }
}

export function clearRateLimit(ip: string) {
  ipAttempts.delete(ip)
}

// ── Magic-link tokens (forgot password) ───────────────────────────────────────
// Stored in memory — tokens expire after 30 minutes and can only be used once.

const MAGIC_EXPIRY_MS = 30 * 60 * 1000
const magicTokens     = new Map<string, number>() // token → expiresAt

export function generateMagicToken(): string {
  const token = randomUUID()
  magicTokens.set(token, Date.now() + MAGIC_EXPIRY_MS)
  return token
}

export function consumeMagicToken(token: string): boolean {
  const expiresAt = magicTokens.get(token)
  magicTokens.delete(token) // one-time use regardless
  if (!expiresAt) return false
  return Date.now() < expiresAt
}
