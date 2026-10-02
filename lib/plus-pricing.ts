// Tiered Plus pricing. All settings-editable.
//
// ⚠️ Rules decided by Teddy 2026-10-01:
//   • The intro price is a NEW-MEMBER promo: first year only, and only for
//     someone who has NEVER had Plus. A lapsed member who waits for a promo
//     window to rejoin pays the standard price (see plusIntroEligible).
//   • Renewals ALWAYS charge the standard price — even if a promo window
//     happens to be running on the renewal day (cron/plus-renew).
//   • The intro window is meant to run in January each year, so signups (and
//     so renewals, 12 months later) bunch up in January. The launch window
//     runs Oct 2026 → Jan 31, 2027.
//
// Settings (studio_settings), with defaults:
//   plus_intro_price_cents    → 9900   ($99 intro)   [falls back to plus_annual_price_cents]
//   plus_standard_price_cents → 14900  ($149 standard)
//   plus_intro_until          → 2027-01-31           (last day of the intro rate)

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
  const introUntil    = m['plus_intro_until'] || '2027-01-31'
  const isIntro       = chiToday() <= introUntil
  return { introCents, standardCents, introUntil, isIntro, currentCents: isIntro ? introCents : standardCents }
}

const digits10 = (p: unknown) => String(p ?? '').replace(/[^\d]/g, '').slice(-10)

/** Has this person ever had Plus? Checked by account (email), by any phone on
 *  file, and — at checkout — by the card's Square fingerprint, so a second
 *  account doesn't reopen the new-member price. Comped members count as having
 *  had it. Returns true when they may still get the intro price. */
export async function plusIntroEligible(db: any, who: { email: string; phones?: (string | null | undefined)[] }): Promise<boolean> {
  const email = who.email.trim().toLowerCase()
  const hadPlus = (po: any) => !!(po && (po.plus || po.plus_started_at || po.plus_expires_at))

  const { data: byEmail } = await db.from('customers').select('id, pricing_overrides, alt_emails').eq('email', email)
  if ((byEmail ?? []).some((c: any) => hadPlus(c.pricing_overrides))) return false
  const { count: paidByEmail } = await db.from('plus_payments')
    .select('id', { count: 'exact', head: true }).eq('customer_email', email)
  if ((paidByEmail ?? 0) > 0) return false

  const phones = Array.from(new Set((who.phones ?? []).map(digits10).filter(p => p.length === 10)))
  if (phones.length) {
    // Phones are stored in mixed formats (832..., 1832..., +1832...) — match on
    // the last 10 digits.
    const ors = phones.flatMap(p => [`phone.eq.${p}`, `phone.eq.1${p}`, `phone.eq.+1${p}`]).join(',')
    const { data: byPhone } = await db.from('customers').select('id, pricing_overrides').or(ors)
    if ((byPhone ?? []).some((c: any) => hadPlus(c.pricing_overrides))) return false
  }
  return true
}

/** Has this physical card (Square fingerprint) ever paid for Plus? */
export async function plusCardUsedBefore(db: any, fingerprint: string | null | undefined): Promise<boolean> {
  if (!fingerprint) return false
  const { count } = await db.from('plus_payments')
    .select('id', { count: 'exact', head: true }).eq('card_fingerprint', fingerprint)
  return (count ?? 0) > 0
}
