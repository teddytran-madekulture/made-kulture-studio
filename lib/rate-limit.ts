// DB-backed rate limiting (migration 145). One counter across every Vercel
// instance — the in-memory Maps this replaces were per-instance and so only
// ever slowed an attacker down by the number of instances they happened to
// hit. Same pattern as the kiosk PIN and staff-login lockouts.
//
//   const r = await rateLimit(`promo:${ip}`, 20, 10 * 60_000)
//   if (!r.allowed) return NextResponse.json({ error: r.message }, { status: 429 })
//
// ⚠️ A FAILED count reads as "not allowed" for money/credential endpoints is
// the safe default, but for a public form it would take the form down with
// the DB — so callers choose: `failOpen: true` lets the request through when
// the table is unreachable (logged loudly).
import { supabaseAdmin } from '@/lib/supabase'

export interface RateLimitResult { allowed: boolean; remaining: number; message: string }

export function clientIp(req: { headers: { get(n: string): string | null } }): string {
  // Vercel sets x-forwarded-for; the first hop is the client as Vercel saw it.
  const xff = req.headers.get('x-forwarded-for') ?? ''
  return (xff.split(',')[0] || req.headers.get('x-real-ip') || 'unknown').trim().slice(0, 64)
}

export async function rateLimit(
  key: string,
  max: number,
  windowMs: number,
  opts: { failOpen?: boolean; message?: string } = {},
): Promise<RateLimitResult> {
  const message = opts.message ?? 'Too many attempts — please wait a few minutes and try again.'
  const db = supabaseAdmin()
  const since = new Date(Date.now() - windowMs).toISOString()
  const { count, error } = await db.from('rate_limit_hits')
    .select('id', { count: 'exact', head: true }).eq('key', key).gte('at', since)
  if (error) {
    console.error('[rate-limit] count failed:', key, error.message)
    return { allowed: !!opts.failOpen, remaining: 0, message }
  }
  const used = count ?? 0
  if (used >= max) return { allowed: false, remaining: 0, message }
  // Record the hit; non-fatal.
  db.from('rate_limit_hits').insert({ key }).then(({ error: e }) => { if (e) console.error('[rate-limit] insert failed:', e.message) })
  // Opportunistic prune (~1 in 50 calls) so the table never grows unbounded.
  if (Math.random() < 0.02) {
    db.from('rate_limit_hits').delete().lt('at', new Date(Date.now() - 86_400_000).toISOString())
      .then(({ error: e }) => { if (e) console.error('[rate-limit] prune failed:', e.message) })
  }
  return { allowed: true, remaining: max - used - 1, message }
}
