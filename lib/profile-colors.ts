// Profile banner colors (migration 121). Stored as a KEY, rendered with a
// dark-mode and a light-mode shade so every choice reads well in both themes.
// Curated on purpose: a free color wheel lets one neon profile wreck the grid.

export type ProfileColor = { key: string; label: string; dark: string; light: string }

export const PROFILE_COLORS: ProfileColor[] = [
  { key: 'oxblood',  label: 'Oxblood',  dark: '#5c1a22', light: '#b04a55' },
  { key: 'rose',     label: 'Rose',     dark: '#7a3b4a', light: '#d9929f' },
  { key: 'blush',    label: 'Blush',    dark: '#8a5a60', light: '#ecc6c4' },
  { key: 'clay',     label: 'Clay',     dark: '#6b3a24', light: '#cf8a63' },
  { key: 'mustard',  label: 'Mustard',  dark: '#76570f', light: '#e0b451' },
  { key: 'gold',     label: 'Gold',     dark: '#6b5320', light: '#d8b86a' },
  { key: 'forest',   label: 'Forest',   dark: '#1f3d2b', light: '#7aa586' },
  { key: 'teal',     label: 'Teal',     dark: '#134449', light: '#63a6a8' },
  { key: 'cobalt',   label: 'Cobalt',   dark: '#1b2f6b', light: '#7593dc' },
  { key: 'plum',     label: 'Plum',     dark: '#3d1f4a', light: '#a886ba' },
  { key: 'charcoal', label: 'Charcoal', dark: '#2a2a2e', light: '#a3a3a8' },
]

export const colorByKey = (key: string | null | undefined) =>
  PROFILE_COLORS.find(c => c.key === key) ?? null

/** Inline CSS vars consumed by .pc-fill / .pc-edge in globals.css. */
export const colorVars = (key: string | null | undefined): React.CSSProperties => {
  const c = colorByKey(key)
  return c ? ({ ['--pc-d' as string]: c.dark, ['--pc-l' as string]: c.light } as React.CSSProperties) : {}
}
