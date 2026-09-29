// Founding Creatives (migration 120): the first FOUNDING_CAP members with a
// complete, directory-listed profile get a numbered gold badge and a bigger
// portfolio, for life.
//
// ⚠️ "Complete" is NOT decided here — it is lib/directory-listing.ts's
// isProfileComplete, the same rule that decides who the directory shows. The
// database only hands out numbers (claim_founding_number) and enforces the
// photo cap (enforce_portfolio_cap); callers pass in who qualifies.
import type { SupabaseClient } from '@supabase/supabase-js'
import { isProfileComplete, type DirectoryProfile } from '@/lib/directory-listing'

export const FOUNDING_CAP = 100
export const PORTFOLIO_BASE = 12
export const PORTFOLIO_FOUNDING = 15

export const portfolioMaxFor = (foundingNumber: number | null | undefined) =>
  foundingNumber ? PORTFOLIO_FOUNDING : PORTFOLIO_BASE

export type FoundingCandidate = DirectoryProfile & {
  directory_opt_in?: boolean | null
  founding_number?: number | null
  founding_blocked?: boolean | null
  created_at?: string | null
}

/** How many Founding spots are taken. Throws on a DB error — a failed count
 *  must never read as "0 taken, 100 left". */
export async function foundingTaken(db: SupabaseClient): Promise<number> {
  const { count, error } = await db.from('customer_profiles')
    .select('id', { count: 'exact', head: true }).not('founding_number', 'is', null)
  if (error) throw new Error(`founding count failed: ${error.message}`)
  return count ?? 0
}

/**
 * Give a Founding number to every listed, complete, unblocked member who
 * doesn't have one yet — oldest account first, until the spots run out.
 * Returns the numbers assigned this call (userId → number). Never throws:
 * a failed claim just leaves that member for the next pass, and is logged.
 */
export async function claimFoundingSpots(
  db: SupabaseClient,
  candidates: FoundingCandidate[],
  hasPhoto: (id: string) => boolean,
): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  const eligible = candidates
    .filter(c => c.directory_opt_in !== false && !c.founding_number && !c.founding_blocked && isProfileComplete(c, hasPhoto(c.id)))
    .sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? ''))
  for (const c of eligible) {
    const { data, error } = await db.rpc('claim_founding_number', { p_user: c.id, p_cap: FOUNDING_CAP })
    if (error) { console.error('[founding] claim failed:', c.id, error.message); break }
    if (typeof data !== 'number') break // spots gone
    out.set(c.id, data)
  }
  return out
}
