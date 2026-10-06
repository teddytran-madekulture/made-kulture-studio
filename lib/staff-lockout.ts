// Staff login / PIN-unlock lockout (2026-10-06 security pass).
//
// Neither /api/staff/login nor /api/staff/unlock had any attempt limit, and the
// owner's staff login IS admin (lib/admin-auth.ts: can(role,'admin.access')).
// The kiosk PIN already counts misses in the DB (lib/kiosk-staff-pin.ts) —
// this is the same idea for the console, using the append-only
// staff_audit_log so no new table is needed. In-memory counters are useless
// on Vercel: every instance has its own memory.
//
// Keyed on the TARGET (email / staff id), not the caller's IP — a lockout that
// only an attacker can reset by changing IPs isn't one.
import { supabaseAdmin } from '@/lib/supabase'

export const STAFF_LOCKOUT_AFTER = 6
export const STAFF_LOCKOUT_WINDOW_MS = 10 * 60 * 1000
export const STAFF_LOCKED_MSG = 'Too many wrong attempts. Try again in 10 minutes.'

const FAIL_ACTION = 'staff.auth_failed'

/** True if this target has hit the limit inside the window. */
export async function staffAuthLocked(target: string): Promise<boolean> {
  const since = new Date(Date.now() - STAFF_LOCKOUT_WINDOW_MS).toISOString()
  const { count, error } = await supabaseAdmin()
    .from('staff_audit_log')
    .select('id', { count: 'exact', head: true })
    .eq('action', FAIL_ACTION)
    .eq('entity_id', target)
    .gte('created_at', since)
  // ⚠️ A failed COUNT must not read as "no failures" — refuse instead.
  if (error) { console.error('[staff-lockout] count failed:', error.message); return true }
  return (count ?? 0) >= STAFF_LOCKOUT_AFTER
}

/** Record one failed attempt against a target. Never throws. */
export async function recordStaffAuthFailure(target: string, kind: 'login' | 'unlock'): Promise<void> {
  try {
    await supabaseAdmin().from('staff_audit_log').insert({
      staff_user_id: null, staff_name: '(unauthenticated)', action: FAIL_ACTION,
      entity_type: 'staff', entity_id: target, details: { kind },
    })
  } catch (e) { console.error('[staff-lockout] record failed', e) }
}
