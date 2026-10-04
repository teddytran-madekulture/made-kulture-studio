// Structured listing prices (migration 140). One formatter, used by the editor
// on save (it writes the result into service_listings.rate) so every reader of
// `rate` — cards, the detail pop-up, the REQUEST message — shows the same thing.

export type PriceUnit = 'hour' | 'half_day' | 'day' | 'flat' | 'project' | 'quote'

export const PRICE_UNITS: { value: PriceUnit; label: string; suffix: string }[] = [
  { value: 'hour',     label: 'Per hour',        suffix: ' / hr' },
  { value: 'half_day', label: 'Per half day',    suffix: ' / half day' },
  { value: 'day',      label: 'Per day',         suffix: ' / day' },
  { value: 'flat',     label: 'Flat rate',       suffix: ' flat' },
  { value: 'project',  label: 'Per project',     suffix: ' / project' },
  { value: 'quote',    label: 'Ask for a quote', suffix: '' },
]

export function isPriceUnit(v: unknown): v is PriceUnit {
  return typeof v === 'string' && PRICE_UNITS.some(u => u.value === v)
}

const money = (cents: number) => {
  const d = cents / 100
  return '$' + d.toLocaleString('en-US', { minimumFractionDigits: Number.isInteger(d) ? 0 : 2, maximumFractionDigits: 2 })
}

/** "From $800 / day", "$75 / hr", "Quote on request". Plain ASCII (it lands in SMS). */
export function formatPrice(cents: number | null | undefined, unit: PriceUnit | null | undefined, from = false): string {
  if (!unit) return ''
  if (unit === 'quote') return cents ? `From ${money(cents)} - quote on request` : 'Quote on request'
  if (cents == null) return ''
  const suffix = PRICE_UNITS.find(u => u.value === unit)?.suffix ?? ''
  return `${from ? 'From ' : ''}${money(cents)}${suffix}`
}

/** Best-effort read of an old free-text rate ("$800/day", "75/hr") so editing
 *  an older listing pre-fills the new fields. Returns null when unsure. */
export function parseLegacyRate(raw: string): { cents: number; unit: PriceUnit; from: boolean } | null {
  const s = raw.toLowerCase()
  const m = s.match(/\$?\s*([\d,]+(?:\.\d{1,2})?)/)
  if (!m) return null
  const cents = Math.round(parseFloat(m[1].replace(/,/g, '')) * 100)
  if (!Number.isFinite(cents)) return null
  const unit: PriceUnit | null =
    /half/.test(s) ? 'half_day' :
    /\b(hr|hour)/.test(s) ? 'hour' :
    /\bday\b|\/\s*day|daily/.test(s) ? 'day' :
    /flat/.test(s) ? 'flat' :
    /project|job/.test(s) ? 'project' : null
  if (!unit) return null
  return { cents, unit, from: /from|start/.test(s) }
}
