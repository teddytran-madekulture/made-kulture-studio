// Canonical creative roles used across signup, /welcome onboarding, the profile
// editor, and the directory. Keep this list in one place so every surface stays
// in sync. Grouped into categories so the picker can show them by section.

export type RoleCategory = { label: string; roles: string[] }

export const ROLE_CATEGORIES: RoleCategory[] = [
  {
    label: 'Photo & Video',
    roles: [
      'Photographer',
      'Videographer',
      'Cinematographer',
      'Camera Operator',
      'Photo/Video Editor',
      'Colorist',
      'Retoucher',
      'Photo Assistant',
    ],
  },
  {
    label: 'Production',
    roles: [
      'Producer',
      'Creative Director',
      'Art Director',
      'Set Designer',
      'Gaffer',
      'Grip',
      'Location Scout',
      'Production Assistant',
    ],
  },
  {
    label: 'Talent & On-Camera',
    roles: ['Model', 'Actor', 'Dancer', 'Host / Presenter'],
  },
  {
    label: 'Glam & Styling',
    roles: ['Makeup Artist', 'Hair Stylist', 'Wardrobe Stylist', 'Nail Artist'],
  },
  {
    label: 'Music & Audio',
    roles: [
      'Singer',
      'Rapper',
      'Musician',
      'Music Producer / Beatmaker',
      'DJ',
      'Songwriter',
      'Audio Engineer',
      'Podcaster',
    ],
  },
  {
    label: 'Art & Design',
    roles: [
      'Painter',
      'Illustrator',
      'Graphic Designer',
      'Fashion Designer',
      'Tattoo Artist',
      'Muralist',
    ],
  },
  {
    label: 'Digital & Brand',
    roles: ['Content Creator', 'Influencer', 'Social Media Manager', 'Writer'],
  },
  // 2026-10-03 — vendors. A member holding any of these gets LISTINGS on their
  // profile (migration 135) and shows under the directory's SERVICES filter.
  // ⚠️ Keep the label in sync with SERVICES_CATEGORY below.
  {
    label: 'Production Services',
    roles: ['Vehicle Rental', 'Wardrobe Rental', 'Prop Rental', 'Equipment Rental', 'Animal Wrangler', 'Catering'],
  },
]

export const SERVICES_CATEGORY = 'Production Services'
export const SERVICE_ROLES: string[] = ROLE_CATEGORIES.find(c => c.label === SERVICES_CATEGORY)?.roles ?? []
/** Starter tags offered in the listing editor, per category. Tags are what
 *  make the Services search find "snake" on a listing titled "Exotic Animal
 *  Handling" — vendors can type their own too. */
export const SERVICE_TAG_SUGGESTIONS: Record<string, string[]> = {
  'Vehicle Rental': ['car', 'truck', 'classic car', 'luxury car', 'motorcycle', 'van', 'bucket truck', 'lift'],
  'Wardrobe Rental': ['wardrobe', 'dress', 'gown', 'suit', 'vintage', 'costume', 'shoes', 'jewelry'],
  'Prop Rental': ['prop', 'furniture', 'decor', 'vintage', 'neon sign', 'pole', 'dance pole', 'florals', 'backdrop'],
  'Equipment Rental': ['lighting', 'camera', 'lens', 'grip', 'drone', 'audio', 'fog'],
  'Animal Wrangler': ['animal', 'dog', 'cat', 'horse', 'snake', 'reptile', 'bird', 'exotic'],
  'Catering': ['catering', 'craft services', 'food', 'coffee', 'drinks', 'snacks'],
}

/** Does this member offer a production service (and so get listings)? */
export function isServiceMember(roles: string[] | null | undefined): boolean {
  const set = new Set(SERVICE_ROLES.map(r => r.toLowerCase()))
  return (roles ?? []).some(r => set.has(r.toLowerCase()))
}

// Flat list of every built-in role (derived) — kept for the /api/roles route and
// any surface that just needs the full set.
export const CREATIVE_ROLES: string[] = ROLE_CATEGORIES.flatMap(c => c.roles)

// A member can select at most this many roles.
export const MAX_ROLES = 3

// Which category a role belongs to (falls back to 'Other' for approved customs).
export function categoryOf(role: string): string {
  const hit = ROLE_CATEGORIES.find(c =>
    c.roles.some(r => r.toLowerCase() === role.toLowerCase())
  )
  return hit ? hit.label : 'Other'
}
