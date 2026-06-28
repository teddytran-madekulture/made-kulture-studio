import { NextRequest, NextResponse } from 'next/server'
import { createHmac, randomUUID, timingSafeEqual } from 'crypto'
import { createClient } from '@supabase/supabase-js'

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
  if (!secret) return 'dev-fallback'
  return createHmac('sha256', secret).update('made-kulture-admin-cookie-v1').digest('hex')
}

// ── Session token (replaces storing the raw password in the cookie) ────────────

export function generateAdminToken(): string {
  const id  = randomUUID()
  const sig = createHmac('sha256', signingKey()).update(id).digest('hex')
  return `${id}.${sig}`
}

export function verifyAdminToken(token: string): boolean {
  try {
    const dot = token.indexOf('.')
    if (dot === -1) return false
    const id  = token.slice(0, dot)
    const sig = token.slice(dot + 1)
    const expected = createHmac('sha256', signingKey()).update(id).digest('hex')
    const a = Buffer.from(sig,      'hex')
    const b = Buffer.from(expected, 'hex')
    return a.length === b.length && timingSafeEqual(a, b)
  } catch {
    return false
  }
}

export function isAdminAuthed(req: NextRequest): boolean {
  const token = req.cookies.get('admin_auth')?.value
  if (!token) return false
  return verifyAdminToken(token)
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
