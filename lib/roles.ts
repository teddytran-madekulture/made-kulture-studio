// Canonical creative roles used across signup, profile, and the directory.
// Keep this list in one place so every surface stays in sync.
export const CREATIVE_ROLES = [
  'Photographer',
  'Videographer',
  'Model',
  'Hair Stylist',
  'Makeup Artist',
  'Wardrobe Stylist',
  'Designer',
  'Creative Director',
  'Producer',
  'Set Designer',
  'Gaffer',
  'Editor',
  'Retoucher',
  'Assistant',
] as const

export type CreativeRole = typeof CREATIVE_ROLES[number]
