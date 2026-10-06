// The ONE staff-PIN check for wall tablets (2026-10-05). Used by the STAFF
// button (/api/floor/mark) and the MUSIC button (/api/kiosk/jukebox).
//
// ⚠️ A wall tablet has no staff cookie, so it must test the PIN against EVERY
// active staff member — which makes a 4-digit PIN brute-forceable over a
// public route. Hence the lockout, counted in the DATABASE (floor_area_events
// 'bad_pin' rows): module-level state on Vercel is per-serverless-instance.
// One shared counter means guessing on the MUSIC button also locks STAFF.
import type { SupabaseClient } from '@supabase/supabase-js'
import { verifySecret } from '@/lib/staff-auth'

export const PIN_LOCKOUT_WINDOW_MS = 10 * 60 * 1000
export const PIN_LOCKOUT_AFTER = 6

export function kioskKeyOk(key: string | null | undefined): boolean {
  const required = process.env.KIOSK_KEY
  // 2026-10-06: fail CLOSED — an unset key used to make this route public.
  if (!required) { console.error('[auth] key env var is not set — refusing'); return false }
  return key === required
}

export type PinResult =
  | { ok: true; staffId: string; staffName: string }
  | { ok: false; status: number; error: string }

/** `code` = the floor area the tablet belongs to (its set slug) — logged on a miss. */
export async function checkKioskStaffPin(db: SupabaseClient, rawPin: unknown, code: string, lockedMsg = 'Too many wrong PINs. Try again in a few minutes.'): Promise<PinResult> {
  const pin = String(rawPin ?? '').trim()
  if (!/^\d{4,6}$/.test(pin)) return { ok: false, status: 400, error: 'Enter your 4-6 digit staff PIN.' }

  const since = new Date(Date.now() - PIN_LOCKOUT_WINDOW_MS).toISOString()
  const { count } = await db.from('floor_area_events')
    .select('id', { count: 'exact', head: true }).eq('action', 'bad_pin').gte('at', since)
  if ((count ?? 0) >= PIN_LOCKOUT_AFTER) return { ok: false, status: 429, error: lockedMsg }

  const { data: staff } = await db
    .from('staff_users').select('id, name, pin_hash').eq('is_active', true).not('pin_hash', 'is', null)
  const match = (staff ?? []).find((s: any) => verifySecret(pin, s.pin_hash))
  if (!match) {
    await db.from('floor_area_events').insert({ code, action: 'bad_pin', source: 'kiosk' })
    return { ok: false, status: 401, error: 'That PIN was not recognised.' }
  }
  return { ok: true, staffId: match.id, staffName: match.name }
}

/** Type guard — tsconfig strict:false disables union narrowing on `!r.ok`. */
export function pinFailed(r: PinResult): r is { ok: false; status: number; error: string } { return !r.ok }
