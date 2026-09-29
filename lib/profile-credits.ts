// Profile credits / résumé (migration 123) — NOT the studio-credit ledger (that is lib/credits.ts): a résumé that reads right for every role —
// a photographer's publications, a model's campaigns, an MUA's music videos,
// a brand's collaborations. One shared shape; the TYPE groups them.

export const CREDIT_TYPES = [
  'Publication', 'Campaign', 'Editorial', 'Film / TV', 'Music Video',
  'Commercial', 'Runway / Show', 'Exhibition', 'Award', 'Education', 'Other',
] as const
export type CreditType = typeof CREDIT_TYPES[number]
export type Credit = { type: CreditType; title: string; role: string; year: number | null; url: string }

export const MAX_CREDITS = 40

/** Server-side cleaner for whatever the client sent. Drops empty/invalid rows. */
export function cleanCredits(raw: unknown): Credit[] {
  if (!Array.isArray(raw)) return []
  const out: Credit[] = []
  for (const r of raw.slice(0, MAX_CREDITS)) {
    const c = r as Partial<Record<keyof Credit, unknown>>
    const title = String(c?.title ?? '').trim().slice(0, 120)
    if (!title) continue
    const type = (CREDIT_TYPES as readonly string[]).includes(String(c?.type)) ? (c!.type as CreditType) : 'Other'
    const y = Number(c?.year)
    out.push({
      type, title,
      role: String(c?.role ?? '').trim().slice(0, 80),
      year: Number.isInteger(y) && y >= 1950 && y <= 2100 ? y : null,
      url: String(c?.url ?? '').trim().slice(0, 300),
    })
  }
  return out
}

/** Grouped for display: types in CREDIT_TYPES order, newest first inside each. */
export function groupCredits(list: Credit[]): { type: CreditType; items: Credit[] }[] {
  return CREDIT_TYPES
    .map(type => ({ type, items: list.filter(c => c.type === type).sort((a, b) => (b.year ?? 0) - (a.year ?? 0)) }))
    .filter(g => g.items.length > 0)
}
