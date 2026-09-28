// Recognising a SUSPENDED customer who comes back under new details (migration 113).
//
// Standing suspensions are keyed to one customer row, so a new email used to be
// a clean slate. This cross-references what a new booking gives us against
// everything we hold on suspended accounts:
//
//   STRONG (block before any charge + text Teddy)
//     card fingerprint · phone · email incl. Gmail dot/+tag variants ·
//     their old alt emails/phones · the "someone else pays" payer contact
//   WEAK   (let it through + push Teddy "possible match")
//     Instagram handle · name + billing ZIP
//
// ⚠️ Never block on a weak signal: names repeat, and a wrong block turns away a
// paying stranger. Weak matches go to a human.
// ⚠️ Fails OPEN (no match) on a read error, and logs it — same rule as standing.

import { standingForCustomerIds } from '@/lib/standing'
import { sendOwnerSMS } from '@/lib/sms'
import { sendOwnerPush } from '@/lib/push'

export type Strength = 'strong' | 'weak'
export interface IdentityMatch {
  customerId: string; customerName: string | null; customerEmail: string | null
  signal: 'card' | 'phone' | 'email' | 'payer' | 'instagram' | 'name_zip'
  strength: Strength; detail: string
}

// ── Normalisers (pure, unit-tested) ─────────────────────────────────────────
export function normPhone(p: unknown): string {
  let d = String(p ?? '').replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1)
  return d.length >= 10 ? d : ''
}
export function canonEmail(e: unknown): string {
  const s = String(e ?? '').trim().toLowerCase()
  const at = s.lastIndexOf('@'); if (at < 1) return ''
  let local = s.slice(0, at), domain = s.slice(at + 1)
  local = local.split('+')[0]                          // jane+mk@ → jane@ (most providers)
  if (domain === 'googlemail.com') domain = 'gmail.com'
  if (domain === 'gmail.com') local = local.replace(/\./g, '')   // Gmail ignores dots
  return local ? `${local}@${domain}` : ''
}
export function normIg(h: unknown): string {
  return String(h ?? '').trim().toLowerCase()
    .replace(/^https?:\/\/(www\.)?instagram\.com\//, '').replace(/^@/, '').replace(/[/?#].*$/, '')
}
export function normName(n: unknown): string {
  return String(n ?? '').trim().toLowerCase().replace(/[^a-z ]/g, '').replace(/\s+/g, ' ')
}
export function normZip(z: unknown): string { return String(z ?? '').trim().slice(0, 5) }

export interface SuspendedProfile {
  id: string; name: string | null; email: string | null
  emails: Set<string>; phones: Set<string>; igs: Set<string>
  fingerprints: Set<string>; zips: Set<string>; nameKey: string
}

// Pure matcher — unit-tested. `excludeIds` = the booker's own record(s): the
// suspended person's OWN row is already blocked by checkBannedAndAlert.
export function matchAgainst(profiles: SuspendedProfile[], q: {
  emails?: unknown[]; phones?: unknown[]; name?: unknown; instagram?: unknown
  fingerprint?: string | null; zip?: unknown; payerContacts?: unknown[]; excludeIds?: string[]
}): IdentityMatch[] {
  const emails = new Set((q.emails ?? []).map(canonEmail).filter(Boolean))
  const phones = new Set((q.phones ?? []).map(normPhone).filter(Boolean))
  const payer = (q.payerContacts ?? []).map(String)
  const payerEmails = new Set(payer.map(canonEmail).filter(Boolean))
  const payerPhones = new Set(payer.map(normPhone).filter(Boolean))
  const ig = normIg(q.instagram), nameKey = normName(q.name), zip = normZip(q.zip)
  const out: IdentityMatch[] = []
  for (const p of profiles) {
    if (q.excludeIds?.includes(p.id)) continue
    const base = { customerId: p.id, customerName: p.name, customerEmail: p.email }
    const hit = (signal: IdentityMatch['signal'], strength: Strength, detail: string) => out.push({ ...base, signal, strength, detail })
    if (q.fingerprint && p.fingerprints.has(q.fingerprint)) hit('card', 'strong', 'same card')
    for (const ph of phones) if (p.phones.has(ph)) { hit('phone', 'strong', `phone …${ph.slice(-4)}`); break }
    for (const e of emails) if (p.emails.has(e)) { hit('email', 'strong', `email ${e}`); break }
    for (const e of payerEmails) if (p.emails.has(e)) { hit('payer', 'strong', `payer email ${e}`); break }
    for (const ph of payerPhones) if (p.phones.has(ph)) { hit('payer', 'strong', `payer phone …${ph.slice(-4)}`); break }
    if (ig && p.igs.has(ig)) hit('instagram', 'weak', `Instagram @${ig}`)
    if (nameKey && zip && nameKey === p.nameKey && p.zips.has(zip)) hit('name_zip', 'weak', `name + ZIP ${zip}`)
  }
  return out
}

// ── Load every suspended account's identity (service-role client) ───────────
export async function loadSuspendedProfiles(db: any): Promise<SuspendedProfile[]> {
  try {
    const nowIso = new Date().toISOString()
    const [{ data: flagged, error: e1 }, { data: withInc, error: e2 }] = await Promise.all([
      db.from('customers').select('id').or(`banned.eq.true,suspended_until.gt.${nowIso}`),
      db.from('customer_incidents').select('customer_id').is('voided_at', null),
    ])
    if (e1 || e2) throw e1 ?? e2
    const candidates = Array.from(new Set([...(flagged ?? []).map((r: any) => r.id), ...(withInc ?? []).map((r: any) => r.customer_id)]))
    if (!candidates.length) return []
    const st = await standingForCustomerIds(db, candidates)
    const ids = candidates.filter(id => st.get(id)?.level === 'suspended')
    if (!ids.length) return []

    const [{ data: custs }, { data: fps }] = await Promise.all([
      db.from('customers').select('id, name, email, phone, alt_emails, alt_phones, alt_names').in('id', ids),
      db.from('customer_card_fingerprints').select('customer_id, fingerprint, billing_postal').in('customer_id', ids),
    ])
    // Instagram lives on the ACCOUNT profile, keyed by auth user id.
    const emailsAll = (custs ?? []).map((c: any) => String(c.email ?? '').toLowerCase()).filter(Boolean)
    const igByEmail = new Map<string, string>()
    if (emailsAll.length) {
      const { data: profs } = await db.from('customer_profiles').select('email, instagram').in('email', emailsAll)
      for (const p of profs ?? []) if (p.instagram) igByEmail.set(String(p.email).toLowerCase(), p.instagram)
    }
    return (custs ?? []).map((c: any) => {
      const f = (fps ?? []).filter((x: any) => x.customer_id === c.id)
      const ig = igByEmail.get(String(c.email ?? '').toLowerCase())
      return {
        id: c.id, name: c.name ?? null, email: c.email ?? null,
        emails: new Set([c.email, ...(c.alt_emails ?? [])].map(canonEmail).filter(Boolean)),
        phones: new Set([c.phone, ...(c.alt_phones ?? [])].map(normPhone).filter(Boolean)),
        igs: new Set([ig].map(normIg).filter(Boolean)),
        fingerprints: new Set(f.map((x: any) => x.fingerprint).filter(Boolean)),
        zips: new Set(f.map((x: any) => normZip(x.billing_postal)).filter(Boolean)),
        nameKey: normName(c.name),
      }
    })
  } catch (e) {
    console.error('[identity-match] load failed — no matching this time', e)
    return []
  }
}

// ── The one call booking doors make ─────────────────────────────────────────
// Returns { block } — true only on a STRONG match. Logs every match, texts Teddy
// on a block, pushes him on a weak one. Never throws.
export async function screenBooking(db: any, q: Parameters<typeof matchAgainst>[1] & { where: string; bookerLabel: string }): Promise<{ block: boolean; matches: IdentityMatch[] }> {
  try {
    const profiles = await loadSuspendedProfiles(db)
    if (!profiles.length) return { block: false, matches: [] }
    const matches = matchAgainst(profiles, q)
    if (!matches.length) return { block: false, matches }
    const block = matches.some(m => m.strength === 'strong')
    const rows = matches.map(m => ({
      suspended_customer_id: m.customerId, signal: m.signal, strength: m.strength, detail: m.detail,
      action: block ? 'blocked' : 'flagged', booker: q.bookerLabel.slice(0, 200), where_seen: q.where,
    }))
    const { error } = await db.from('identity_matches').insert(rows)
    if (error) console.error('[identity-match] log insert failed', error)
    const who = Array.from(new Set(matches.map(m => m.customerName || m.customerEmail || 'a suspended account'))).join(', ')
    const why = matches.map(m => m.detail).join(', ')
    if (block) {
      await sendOwnerSMS(`⛔ Booking BLOCKED before payment: ${q.bookerLabel} matches suspended ${who} (${why}). ${q.where}.`).catch(() => {})
    } else {
      await sendOwnerPush({ title: 'Possible suspended customer', body: `${q.bookerLabel} may be ${who} (${why}). Booking went through — check it.`, url: '/admin/standing' }).catch(() => {})
    }
    return { block, matches }
  } catch (e) {
    console.error('[identity-match] screen failed (non-fatal)', e)
    return { block: false, matches: [] }
  }
}

// Remember a card's fingerprint against the customer who used it, so a future
// suspension can recognise the card under any new account. Never throws.
export async function rememberCard(db: any, customerId: string | null | undefined, card: any): Promise<void> {
  try {
    if (!customerId || !card?.fingerprint) return
    const { error } = await db.from('customer_card_fingerprints').upsert({
      customer_id: customerId, fingerprint: card.fingerprint, square_card_id: card.id ?? null,
      last4: card.last4 ?? null, brand: card.cardBrand ?? null,
      billing_postal: card.billingAddress?.postalCode ?? null, seen_at: new Date().toISOString(),
    }, { onConflict: 'fingerprint,customer_id' })
    if (error) console.error('[identity-match] rememberCard failed', error)
  } catch (e) { console.error('[identity-match] rememberCard error', e) }
}
