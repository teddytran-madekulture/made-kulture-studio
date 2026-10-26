// Nomad check-out checklist (2026-10-26). Shared by the member page and the
// API so the items the member ticks are exactly the items the server requires.
// Pure, no server imports — safe in client components.
export const CHECKOUT_ITEMS: [string, string][] = [
  ['space', 'Shooting space reset: backdrop, lights and furniture back where they were'],
  ['trash', 'Trash taken out'],
  ['kitchen', 'Dishes done and kitchen wiped down'],
  ['off', 'Lights, AC and appliances off'],
  ['locked', 'Windows closed and doors locked'],
  ['belongings', 'Nothing left behind'],
]
export const CHECKOUT_MIN_PHOTOS = 2
export const CHECKOUT_MAX_PHOTOS = 6
export const CHECKOUT_BUCKET = 'nomad-checkout'
