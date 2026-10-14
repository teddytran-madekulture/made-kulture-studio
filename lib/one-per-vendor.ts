// Pure (no server imports) so the client Services page can use it too.
/** 2026-10-14: one card per vendor, in the order given — so a vendor with ten
 *  listings can't fill a grid. The rest are counted in `more` (vendor id ->
 *  hidden count) for a "+N more from X" link. `prefer` keeps that listing as
 *  its vendor's card (deep links). Generic over anything with a vendor id. */
export function onePerVendor<T extends { id: string; vendor?: { id: string } | null }>(list: T[], prefer?: string | null): { shown: T[]; more: Record<string, number> } {
  const pick = new Map<string, T>()
  const count = new Map<string, number>()
  for (const l of list) {
    const v = l.vendor?.id ?? l.id
    count.set(v, (count.get(v) ?? 0) + 1)
    if (!pick.has(v) || l.id === prefer) pick.set(v, l)
  }
  const chosen = new Set(Array.from(pick.values()).map(l => l.id))
  const shown = list.filter(l => chosen.has(l.id))
  const more: Record<string, number> = {}
  count.forEach((n, v) => { if (n > 1) more[v] = n - 1 })
  return { shown, more }
}
