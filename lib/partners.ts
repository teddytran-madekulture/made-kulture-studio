// Partner links (migration 166). Shared constants + the server helpers.
import type { SupabaseClient } from '@supabase/supabase-js'

export const PARTNER_COOKIE = 'mk_ref'
export const PARTNER_COOKIE_DAYS = 30

/** Codes are short, lowercase, URL-safe: "neiljou", "kiah-joy". */
export function cleanPartnerCode(raw: unknown): string | null {
  const c = String(raw ?? '').trim().toLowerCase()
  return /^[a-z0-9][a-z0-9-]{1,30}$/.test(c) ? c : null
}

/** The active partner with this code, or null. Logs (never throws) — a partner
 *  lookup must never be the reason a page or a booking fails. */
export async function activePartner(db: SupabaseClient, code: string | null): Promise<{ id: string; code: string; clicks: number } | null> {
  const c = cleanPartnerCode(code)
  if (!c) return null
  const { data, error } = await db.from('partners').select('id, code, clicks, active').ilike('code', c).maybeSingle()
  if (error) { console.error('[partners] lookup failed:', error.message); return null }
  return data && data.active ? { id: data.id, code: data.code, clicks: data.clicks ?? 0 } : null
}
