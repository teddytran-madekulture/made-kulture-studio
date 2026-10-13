// A vendor's own work as a second identity on their directory profile
// (migration 170). The PORTFOLIO tab gets its own name, and while it is open
// the profile header shows this tagline / bio / Instagram / site instead of
// the business's. First cases: Neil Jou (agency + "Neil Jou Studios") and a
// film lab whose owner also shoots.
//
// Vendors only — a creative's profile already IS their own work. The roster
// tab's company identity stays on company_rosters (migration 168).

export type SecondProfile = { label: string; tagline: string; bio: string; instagram: string; website: string }

export const SECOND_PROFILE_LIMITS = { label: 40, tagline: 80, bio: 600, instagram: 40, website: 200 } as const

export const SECOND_PROFILE_COLUMNS = 'second_label, second_tagline, second_bio, second_instagram, second_website'

type Row = {
  account_type?: string | null
  second_label?: string | null; second_tagline?: string | null; second_bio?: string | null
  second_instagram?: string | null; second_website?: string | null
}

/** Null unless a VENDOR has filled something in, so nothing changes for anyone
 *  else — and a vendor who switches back to creative stops showing it. */
export function secondProfileOf(r: Row): SecondProfile | null {
  if (r.account_type !== 'vendor') return null
  const s: SecondProfile = {
    label: (r.second_label ?? '').trim(), tagline: (r.second_tagline ?? '').trim(), bio: (r.second_bio ?? '').trim(),
    instagram: (r.second_instagram ?? '').trim(), website: (r.second_website ?? '').trim(),
  }
  return s.label || s.tagline || s.bio || s.instagram || s.website ? s : null
}

/** Does this second profile change the header (vs only renaming the tab)? */
export function secondSwapsHeader(s: SecondProfile | null | undefined): boolean {
  return !!s && !!(s.tagline || s.bio || s.instagram || s.website)
}
