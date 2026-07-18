// Tiered Plus pricing. Intro rate applies through `plus_intro_until` (Houston
// date), standard rate after. First-year intro only — renewals use whatever the
// price is at renewal time (no per-member lock). All settings-editable.
//
// Settings (studio_settings), with defaults:
//   plus_intro_price_cents    → 9900   ($99 intro)   [falls back to plus_annual_price_cents]
//   plus_standard_price_cents → 14900  ($149 standard)
//   plus_intro_until          → 2026-12-31           (last day of the intro rate)

export interface PlusPricing {
  introCents: number
  standardCents: number
  introUntil: string   // YYYY-MM-DD
  currentCents: number // price right now
  isIntro: boolean     // is the intro rate active today?
}

function num(v: string | undefined, d: number): number {
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : d
}

// Houston-local today as YYYY-MM-DD (pricing cutoffs are calendar-based).
function chiToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
}

// `db` is a supabase-js client (service role).
export async function getPlusPricing(db: any): Promise<PlusPricing> {
  const { data } = await db
    .from('studio_settings').select('key, value')
    .in('key', ['plus_intro_price_cents', 'plus_standard_price_cents', 'plus_intro_until', 'plus_annual_price_cents'])
  const m: Record<string, string> = {}
  for (const r of data ?? []) m[r.key] = r.value

  const introCents    = num(m['plus_intro_price_cents'], num(m['plus_annual_price_cents'], 9900))
  const standardCents = num(m['plus_standard_price_cents'], 14900)
  const introUntil    = m['plus_intro_until'] || '2026-12-31'
  const isIntro       = chiToday() <= introUntil
  return { introCents, standardCents, introUntil, isIntro, currentCents: isIntro ? introCents : standardCents }
}
