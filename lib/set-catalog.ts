// The ONE server-side answer to "which sets exist, and what does an hour cost?"
//
// ⚠️ Until 2026-10-09 the answer lived in hardcoded tables copied across the
// codebase (SET_PRICES / SLUG_TO_NAME / SET_MIN_HOURS in app/api/bookings,
// lib/booking-core, lib/admin-manual-check, app/api/availability, and
// RATE_BY_NAME in lib/guest-rate). The `sets` table that Admin → Products &
// Pricing edits was DISPLAY ONLY: change Set A to $45 there and every page
// showed $45 while checkout kept charging $40. A brand-new set (a Set Drop
// room) could not be booked at all until someone hand-edited five files.
//
// Now every charge path reads the `sets` row. On 2026-10-09 the live rows were
// checked against the old tables (all ten matched to the dollar, incl. the two
// 2-hour minimums), so switching changed no price.
//
// Server only — uses the service-role client passed in by the caller.

import type { SupabaseClient } from '@supabase/supabase-js'

export interface CatalogSet {
  id:        string
  slug:      string
  name:      string
  rate:      number    // member hourly rate (rate_per_hour)
  minHours:  number    // min_hours, defaults to 1
  isActive:  boolean
  spaceGroup: string | null  // migration 163 — sets sharing one physical space
}

export interface SetCatalog {
  bySlug: Record<string, CatalogSet>
  byName: Record<string, CatalogSet>
  byId:   Record<string, CatalogSet>
  list:   CatalogSet[]
}

// A few seconds of reuse within one warm serverless instance. Short on purpose:
// an admin rate edit should reach checkout within seconds, and a checkout that
// reads a 10-second-old rate is still reading the database, not a code table.
const TTL_MS = 10_000
let cached: { at: number; cat: SetCatalog } | null = null

/**
 * Load every set (active AND inactive — history and archived drop rooms still
 * need names and rates). Throws on a failed read: a checkout that silently
 * priced from an empty catalog would refuse every booking as "set not found",
 * or worse, price at 0.
 */
export async function loadSetCatalog(db: SupabaseClient, opts: { fresh?: boolean } = {}): Promise<SetCatalog> {
  if (!opts.fresh && cached && Date.now() - cached.at < TTL_MS) return cached.cat
  const { data, error } = await db
    .from('sets')
    .select('*')   // '*' so a missing newer column (space_group before 163 runs) can't break checkout
    .order('sort_order', { ascending: true })
  if (error) throw new Error(`set catalog lookup failed: ${error.message}`)

  const list: CatalogSet[] = (data ?? []).map((s: any) => ({
    id:       s.id,
    slug:     String(s.slug ?? ''),
    name:     String(s.name ?? ''),
    rate:     Number(s.rate_per_hour) || 0,
    minHours: Number(s.min_hours) > 0 ? Number(s.min_hours) : 1,
    isActive: s.is_active !== false,
    spaceGroup: s.space_group ? String(s.space_group) : null,
  }))
  const cat: SetCatalog = { bySlug: {}, byName: {}, byId: {}, list }
  for (const s of list) {
    if (s.slug) cat.bySlug[s.slug] = s
    if (s.name) cat.byName[s.name] = s
    cat.byId[s.id] = s
  }
  cached = { at: Date.now(), cat }
  return cat
}

/**
 * SHARED SPACE (migration 163). Some sets are built in the same physical room —
 * the Winter Is Coming set lives inside Studio One — so they can each be booked,
 * but never at the same time. Every set with the same `space_group` blocks the
 * others. Returns the set's own id plus its space-mates; a set with no group
 * (every normal set) returns just itself.
 *
 * ⚠️ Any check that asks "is this set free?" must look at ALL of these ids,
 * not `.eq('set_id', id)` — exactly the blind spot buyouts once had.
 */
export function spaceMates(cat: SetCatalog, setId: string): string[] {
  const g = cat.byId[setId]?.spaceGroup
  if (!g) return [setId]
  const ids = cat.list.filter(s => s.spaceGroup === g).map(s => s.id)
  return ids.includes(setId) ? ids : [setId, ...ids]
}

/** spaceMates, loading the catalog. Throws on a failed read (never "no mates"). */
export async function spaceMatesOf(db: SupabaseClient, setId: string): Promise<string[]> {
  return spaceMates(await loadSetCatalog(db), setId)
}

/** Drop the cache — call after an admin edits a set so the next read is live. */
export function invalidateSetCatalog() { cached = null }

/**
 * Member hourly rate for a set, applying a customer's negotiated rate.
 * Same override precedence the old hardcoded setRateFor used:
 * per-set override → global hourly override → list rate.
 */
export function catalogRate(cat: SetCatalog, slug: string, pricingOverrides?: any): number {
  let rate = cat.bySlug[slug]?.rate ?? 0
  if (pricingOverrides) {
    const perSet = pricingOverrides.sets?.[slug]
    const global = pricingOverrides.hourly_rate
    if (perSet != null) rate = Number(perSet)
    else if (global != null) rate = Number(global)
  }
  return rate
}

export function catalogMinHours(cat: SetCatalog, slug: string | null | undefined): number {
  return (slug && cat.bySlug[slug]?.minHours) || 1
}
