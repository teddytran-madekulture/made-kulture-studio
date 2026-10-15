// 2026-10-14 — Square keeps EXPIRED saved cards as `enabled: true`. Every
// "pick the first enabled card" lookup could therefore land on a dead card:
// Christopher Joseph's ADD TIME on Set D failed three times (and the admin
// retry once) with CARD_EXPIRED on a Visa that expired 09/2024, because his
// no-charge rebooked session had no card linked and the fallback grabbed
// cards[0]. Use these helpers anywhere a saved card is chosen automatically
// or offered to staff.

type CardLike = { enabled?: boolean | null; expMonth?: bigint | number | null; expYear?: bigint | number | null }

/** A card is good through the LAST day of its expiry month. Unknown expiry = not expired. */
export function isCardExpired(c: CardLike, now: Date = new Date()): boolean {
  if (c.expMonth == null || c.expYear == null) return false
  const m = Number(c.expMonth), y = Number(c.expYear)
  if (!m || !y) return false
  // First moment of the month AFTER the expiry month (Date months are 0-based).
  return now.getTime() >= new Date(y, m, 1).getTime()
}

/** Enabled AND not expired. */
export function isCardUsable(c: CardLike): boolean {
  return c.enabled !== false && !isCardExpired(c)
}
