// Set Care (2026-11-10, migration 184) — the ONE list of sections and the
// fields each one carries. Shared by the admin page (to draw the forms) and
// the API (to whitelist what gets stored), so the two can never disagree.
// Pure and dependency-free on purpose: it is imported client-side.

export type CareKind = 'finish' | 'part' | 'cleaning' | 'equipment' | 'procedure' | 'note' | 'maintenance' | 'water'

export interface CareField { key: string; label: string; long?: boolean; link?: boolean; placeholder?: string }
export interface CareSection {
  kind: CareKind
  label: string
  blurb: string
  pool?: boolean          // only shown on pool sets
  log?: boolean           // dated entry (newest first), no title required
  titleLabel?: string     // label for the title box; omitted for logs
  fields: CareField[]
}

export const CARE_SECTIONS: CareSection[] = [
  {
    kind: 'finish', label: 'Finishes', titleLabel: 'What it is',
    blurb: 'Paint, flooring, curtains, carpet, backdrops — exactly what to buy again.',
    fields: [
      { key: 'brand', label: 'Brand', placeholder: 'Behr Ultra' },
      { key: 'color', label: 'Color name', placeholder: 'Polar Bear' },
      { key: 'code', label: 'Color code', placeholder: '75' },
      { key: 'sheen', label: 'Sheen / finish', placeholder: 'Matte' },
      { key: 'supplier', label: 'Where to buy', placeholder: 'Home Depot, Gulf Fwy' },
      { key: 'link', label: 'Link', link: true },
      { key: 'notes', label: 'Notes', long: true },
    ],
  },
  {
    kind: 'part', label: 'Parts & Replacements', titleLabel: 'Item',
    blurb: 'Bulbs, hardware, fabric, anything that wears out. The link is your reorder button.',
    fields: [
      { key: 'model', label: 'Model / size' },
      { key: 'supplier', label: 'Where to buy' },
      { key: 'link', label: 'Link', link: true },
      { key: 'price', label: 'Last price paid', placeholder: '$24.99' },
      { key: 'notes', label: 'Notes', long: true },
    ],
  },
  {
    kind: 'cleaning', label: 'Cleaning', titleLabel: 'What it covers',
    blurb: 'How to clean this set, what to use, and what never to use.',
    fields: [
      { key: 'steps', label: 'Steps (one per line)', long: true },
      { key: 'products', label: 'Products to use' },
      { key: 'never', label: 'Never use' },
      { key: 'notes', label: 'Notes', long: true },
    ],
  },
  {
    kind: 'equipment', label: 'Equipment', titleLabel: 'Item', pool: true,
    blurb: 'Pump, filter, hoses, printed intakes — model numbers and where they came from.',
    fields: [
      { key: 'model', label: 'Model' },
      { key: 'supplier', label: 'Where to buy' },
      { key: 'link', label: 'Link', link: true },
      { key: 'price', label: 'Last price paid' },
      { key: 'notes', label: 'Notes', long: true },
    ],
  },
  {
    kind: 'procedure', label: 'Procedures', titleLabel: 'Procedure', pool: true,
    blurb: 'Fill, drain, startup, shutdown — the steps and the tricks.',
    fields: [
      { key: 'steps', label: 'Steps (one per line)', long: true },
      { key: 'notes', label: 'Tips / warnings', long: true },
    ],
  },
  {
    kind: 'maintenance', label: 'Maintenance Log', log: true,
    blurb: 'What was done and when. Newest first.',
    fields: [
      { key: 'details', label: 'What was done', long: true },
      { key: 'cost', label: 'Cost', placeholder: '$45' },
    ],
  },
  {
    kind: 'water', label: 'Water Log', log: true, pool: true,
    blurb: 'Readings and what you added. Every box is optional.',
    fields: [
      { key: 'ph', label: 'pH' },
      { key: 'chlorine', label: 'Chlorine (ppm)' },
      { key: 'temp', label: 'Temp (°F)' },
      { key: 'added', label: 'Added' },
      { key: 'details', label: 'Notes', long: true },
    ],
  },
  {
    kind: 'note', label: 'Notes & Known Issues', titleLabel: 'Title',
    blurb: 'Anything that doesn’t fit above.',
    fields: [{ key: 'body', label: 'Note', long: true }],
  },
]

export const CARE_KINDS = CARE_SECTIONS.map(s => s.kind)
export const sectionFor = (kind: string) => CARE_SECTIONS.find(s => s.kind === kind)

export const MAX_CARE_PHOTOS = 8
const MAX_FIELD = 4000
const MAX_TITLE = 200

/** Keep only this section's own keys, as trimmed, length-capped strings. Empty values are dropped. */
export function cleanCareFields(kind: string, raw: unknown): Record<string, string> {
  const sec = sectionFor(kind)
  const out: Record<string, string> = {}
  if (!sec || !raw || typeof raw !== 'object') return out
  for (const f of sec.fields) {
    const v = (raw as any)[f.key]
    if (typeof v !== 'string') continue
    const t = v.trim().slice(0, MAX_FIELD)
    if (t) out[f.key] = t
  }
  return out
}
export const cleanCareTitle = (t: unknown) => (typeof t === 'string' ? t.trim().slice(0, MAX_TITLE) : '')

/** 'YYYY-MM-DD' → "Nov 10, 2026". Parsed as a local calendar date, never through UTC. */
export function careDate(d: string) {
  const [y, m, day] = d.split('-').map(Number)
  return new Date(y, m - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}
/** Today's date in the studio's time zone, as 'YYYY-MM-DD'. */
export const careToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())

/** Only http(s) links render as links — a stored "javascript:" must never become clickable. */
export const safeLink = (v?: string) => (v && /^https?:\/\//i.test(v) ? v : null)
