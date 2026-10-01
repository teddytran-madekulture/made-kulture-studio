// THE gate for every members-only community feature: browsing the directory,
// opening a profile, messaging, following, and the casting board.
//
// ⚠️ 2026-10-01: these routes used to check only `directory_opt_in` — the
// TOGGLE — so a member who switched it on and never wrote a bio could browse
// everyone, message and follow them, and answer castings, while being
// invisible themselves (the directory hides incomplete profiles). Teddy's
// rule: the whole point is that you show up; no listing, no benefits.
//
// "Listed" = opted in AND isProfileComplete — the exact test /api/directory
// uses to decide who is shown, via lib/directory-listing.ts. Do NOT write a
// second copy of the completeness rule here or in a route.
//
// Server-only (takes a service-role client). The pure rule stays in
// lib/directory-listing.ts so client pages can import it.
import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { profileBlockers, type ListingBlocker } from '@/lib/directory-listing'

export type MemberAccess = { optedIn: boolean; listed: boolean; blockers: ListingBlocker[] }

/** Is this member actually listed in the directory? Throws on a DB error —
 *  a failed lookup must never read as "listed" (or silently as "not"). */
export async function memberAccess(db: SupabaseClient, userId: string): Promise<MemberAccess> {
  const { data: p, error } = await db.from('customer_profiles')
    .select('id, full_name, roles, bio, instagram, links, account_type, directory_opt_in')
    .eq('id', userId).maybeSingle()
  if (error) throw new Error(`member access lookup failed: ${error.message}`)
  if (!p) return { optedIn: false, listed: false, blockers: [] }
  // Same photo test as /api/directory: ANY portfolio image counts.
  const { count, error: picErr } = await db.from('portfolio_images')
    .select('id', { count: 'exact', head: true }).eq('user_id', userId)
  if (picErr) throw new Error(`member photo lookup failed: ${picErr.message}`)
  const blockers = profileBlockers(p, (count ?? 0) > 0)
  const optedIn = !!p.directory_opt_in
  return { optedIn, listed: optedIn && blockers.length === 0, blockers }
}

/** The 403 for a member who isn't listed. `optedOut` → turn the toggle on;
 *  `incomplete` → finish the profile (carries the blockers so the page can say
 *  exactly what is missing). */
export function notListedResponse(a: MemberAccess, action: string) {
  if (!a.optedIn) {
    return NextResponse.json({ error: `Join the directory to ${action}.`, optedOut: true }, { status: 403 })
  }
  return NextResponse.json(
    { error: `Finish your profile to ${action}. Missing: ${a.blockers.join(', ')}.`, incomplete: true, blockers: a.blockers },
    { status: 403 },
  )
}
