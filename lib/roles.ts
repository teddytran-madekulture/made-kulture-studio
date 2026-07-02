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
]

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
