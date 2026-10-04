import { Client } from 'square'

// Shared "find or create" for Square customer profiles — the guard that stops
// this app's own flows (checkout, manual charge, save-card) from spawning
// DUPLICATE Square customers for an email that already exists.
//
// Square's API has no merge, and one email routinely has several duplicate
// profiles (Acuity / third-party imports). So before creating, we always search
// by exact email and reuse an existing profile. When duplicates already exist we
// pick a deterministic canonical one — prefer a profile that has cards on file
// (so saved cards stay together), else the oldest — using data already in the
// search result, with no extra API calls.

function pickCanonical(matches: any[]): string | null {
  if (!matches.length) return null
  const withCards = matches.filter(c =>
    (c.segmentIds ?? []).some((s: string) => s.includes('CARDS_ON_FILE'))
  )
  const pool = withCards.length ? withCards : matches
  pool.sort((a, b) => {
    const ta = a.createdAt ? Date.parse(a.createdAt) : 0
    const tb = b.createdAt ? Date.parse(b.createdAt) : 0
    return ta - tb // oldest first
  })
  return pool[0]?.id ?? null
}

// Deterministic ≤45-char idempotency key per email so two near-simultaneous
// "create" calls for the same NEW email can't both make a profile (covers the
// brief window where a just-created customer isn't yet searchable).
function emailKey(email: string): string {
  let h = 0
  for (let i = 0; i < email.length; i++) { h = (h * 31 + email.charCodeAt(i)) | 0 }
  return `mk-cust-${(h >>> 0).toString(16)}-${email.length}`.slice(0, 45)
}

export async function findOrCreateSquareCustomer(
  square: Client,
  { email, name, phone }: { email?: string | null; name?: string | null; phone?: string | null }
): Promise<string | null> {
  const cleanEmail = (email ?? '').trim().toLowerCase() || null

  // 1. Reuse an existing profile for this email.
  if (cleanEmail) {
    try {
      const { result } = await square.customersApi.searchCustomers({
        query: { filter: { emailAddress: { exact: cleanEmail } } },
      })
      const existing = pickCanonical(result.customers ?? [])
      if (existing) return existing
    } catch (e) {
      console.error('[square-customer] search failed', e)
    }
  }

  // 2. None found → create one.
  try {
    const nameParts = (name ?? '').trim().split(/\s+/).filter(Boolean)
    const { result } = await square.customersApi.createCustomer({
      emailAddress:   cleanEmail ?? undefined,
      givenName:      nameParts[0] || undefined,
      familyName:     nameParts.slice(1).join(' ') || undefined,
      phoneNumber:    phone ?? undefined,
      idempotencyKey: cleanEmail ? emailKey(cleanEmail) : undefined,
    })
    return result.customer?.id ?? null
  } catch (e) {
    console.error('[square-customer] create failed', e)
    return null
  }
}

// A usable card already on file for this email, across every Square profile
// that carries it (duplicates are common). null when there is none or Square
// can't be reached - callers treat that as "no card". (2026-10-04)
export async function findCardOnFileByEmail(
  square: Client,
  email: string | null | undefined,
): Promise<{ customerId: string; cardId: string } | null> {
  const cleanEmail = (email ?? '').trim().toLowerCase()
  if (!cleanEmail) return null
  try {
    const { result } = await square.customersApi.searchCustomers({
      query: { filter: { emailAddress: { exact: cleanEmail } } },
    })
    for (const c of result.customers ?? []) {
      if (!c.id) continue
      const cards = await square.cardsApi.listCards(undefined, c.id).then(r => r.result.cards ?? []).catch(() => [])
      const card = cards.find(k => k.enabled && k.id)
      if (card?.id) return { customerId: c.id, cardId: card.id }
    }
  } catch (e) {
    console.error('[square-customer] card-on-file lookup failed', e)
  }
  return null
}
