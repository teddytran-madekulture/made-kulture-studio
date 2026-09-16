// THE one rule for "does this profile actually appear in the Creative Directory?"
//
// A member can opt in and still be invisible, because the directory refuses to
// list a profile with nothing in it — an empty card is worse than no card. That
// rule lived only inside `app/api/directory/route.ts`, which meant the ADMIN had
// no way to see who was opted in but hidden, and anyone rebuilding the rule
// elsewhere would have written a second copy of it. Tonight's Acuity-map bug was
// exactly that shape, so this one starts shared. See [[silent-failure-pattern]].
//
// ⚠️ Completeness is SEPARATE from opt-in on purpose. `/api/directory` filters
// `directory_opt_in` in the query before it ever gets here, so folding opt-in
// into this function would change that route's behaviour. The admin view adds
// opted-out as its own blocker instead.

export type DirectoryProfile = {
  id: string
  full_name: string | null
  roles: string[] | null
  bio: string | null
  instagram: string | null
  links: unknown
  account_type?: string | null
}

/** Human-readable reasons a profile would not be listed. Empty ⇒ it lists. */
export type ListingBlocker = 'no name' | 'no role' | 'no bio' | 'nothing to show'

/**
 * @param hasPhoto whether this member has at least one portfolio image. Passed
 *        in rather than looked up, so a list view can resolve every member's
 *        photos in ONE query instead of one per row.
 */
export function profileBlockers(p: DirectoryProfile, hasPhoto: boolean): ListingBlocker[] {
  const out: ListingBlocker[] = []
  if (!(p.full_name ?? '').trim()) out.push('no name')
  // Brands have no creative roles, and requiring one would hide every brand.
  if (p.account_type !== 'brand' && (p.roles?.length ?? 0) < 1) out.push('no role')
  if (!(p.bio ?? '').trim()) out.push('no bio')
  const hasLink = Array.isArray(p.links) && p.links.length > 0
  const hasIg = !!(p.instagram ?? '').trim()
  if (!hasPhoto && !hasLink && !hasIg) out.push('nothing to show')
  return out
}

export function isProfileComplete(p: DirectoryProfile, hasPhoto: boolean): boolean {
  return profileBlockers(p, hasPhoto).length === 0
}
