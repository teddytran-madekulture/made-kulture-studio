// Company rosters (migration 165) — the PURE half: types and the mapping from
// a company's Shopify product feed to roster cards. No DB, no fetch, so the
// client components and the sync job share one definition and it can be
// unit-tested. The DB/fetch half is lib/roster-sync.ts.

export type RosterStatus = 'draft' | 'live' | 'hidden'

/** One talent card as the directory shows it. */
export type RosterTalent = {
  id: string
  name: string
  division: string        // 'Women' | 'Men' | '' — display label
  cities: string[]        // ['Houston', 'Dallas']
  bio: string
  photos: string[]        // the company site's own CDN URLs
  profile_url: string     // that talent's page on the company site
}

export type PublicRoster = {
  label: string
  company_url: string
  talent: RosterTalent[]
}

/** A talent row ready to upsert (before it has our id). */
export type MappedTalent = Omit<RosterTalent, 'id'> & { external_id: string; sort_order: number }

// ⚠️ THE YOUTH RULE. Anything that looks like a minor is dropped at sync time,
// whatever the roster's include tag says. The directory has 18+ content and open
// messaging; children's photos do not belong in it. Deliberately broad — a
// false positive hides one adult card, a false negative puts a child in.
const MINOR_RE = /\b(youth|kid|kids|child|children|teen|teens|junior|juniors|minor|minors|baby|babies|toddler|tween|tweens|boys|girls)\b/i

export function looksLikeMinor(tags: string[], productType: string, title: string): boolean {
  if (MINOR_RE.test(productType)) return true
  if (tags.some(t => MINOR_RE.test(t))) return true
  // A title like "Kids Portfolio Package" — not a person, and not for us either.
  return MINOR_RE.test(title)
}

/** Shopify's storefront feed gives tags as an array; some themes/exports give
 *  one comma-separated string. Accept both. */
export function tagList(raw: unknown): string[] {
  if (Array.isArray(raw)) return raw.map(t => String(t).trim()).filter(Boolean)
  if (typeof raw === 'string') return raw.split(',').map(t => t.trim()).filter(Boolean)
  return []
}

function divisionOf(productType: string, tags: string[]): string {
  const all = [productType, ...tags].map(s => s.toLowerCase())
  // Women first: "female" is checked before "male", and \bmale\b cannot
  // match inside "female" (no word boundary between e and m).
  if (all.some(s => /\b(female|females|women|woman)\b/.test(s))) return 'Women'
  if (all.some(s => /\b(male|males|men|man)\b/.test(s))) return 'Men'
  return ''
}

/** "Houston - Texas" → "Houston". A tag counts as a city only in that
 *  "City - State" shape, so ordinary tags ("Female Models") never leak in. */
function citiesOf(tags: string[]): string[] {
  const out: string[] = []
  for (const t of tags) {
    const m = t.match(/^\s*([A-Za-z .'-]{2,40}?)\s+-\s+[A-Za-z .]{2,30}$/)
    if (m) { const c = m[1].trim(); if (!out.includes(c)) out.push(c) }
  }
  return out
}

/** Bio text from Shopify's body_html: tags out, entities decoded, capped. */
export function plainText(html: string, max = 700): string {
  const s = String(html ?? '')
    .replace(/<\s*(br|\/p|\/div|\/li|\/h\d)\s*\/?>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&[a-z]+;/gi, ' ')
    .replace(/[ \t]+/g, ' ').replace(/\s*\n\s*/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return s.length > max ? s.slice(0, max - 1).trimEnd() + '…' : s
}

/** The site's origin only — "https://neiljouagency.com/collections/x" →
 *  "https://neiljouagency.com". Throws on anything that isn't http(s). */
export function siteOrigin(url: string): string {
  const raw = /^https?:\/\//i.test(url.trim()) ? url.trim() : `https://${url.trim()}`
  const u = new URL(raw)
  if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error('Not a web address.')
  return u.origin
}

/** Ask Shopify's CDN for a smaller copy. Leaves non-Shopify URLs alone. */
export function sizedImage(url: string, width: number): string {
  if (!/cdn\.shopify\.com|\/cdn\/shop\//.test(url)) return url
  try { const u = new URL(url); u.searchParams.set('width', String(width)); return u.toString() } catch { return url }
}

export const MAX_PHOTOS_PER_TALENT = 6

/** Shopify products → roster cards. Returns the cards plus how many were
 *  skipped and why, so the admin page can say "12 skipped (youth)". */
export function mapShopifyProducts(products: any[], origin: string, includeTag: string): {
  talent: MappedTalent[]; skippedMinor: number; skippedNotTalent: number
} {
  const want = includeTag.trim().toLowerCase()
  const talent: MappedTalent[] = []
  let skippedMinor = 0, skippedNotTalent = 0
  products.forEach((p, i) => {
    const tags = tagList(p?.tags)
    const type = String(p?.product_type ?? '')
    const title = String(p?.title ?? '').trim()
    if (!title || !p?.handle) { skippedNotTalent++; return }
    if (want && !tags.some(t => t.toLowerCase() === want)) { skippedNotTalent++; return }
    if (looksLikeMinor(tags, type, title)) { skippedMinor++; return }
    const photos = (Array.isArray(p?.images) ? p.images : [])
      .map((im: any) => String(im?.src ?? '')).filter((s: string) => /^https:\/\//.test(s))
      .slice(0, MAX_PHOTOS_PER_TALENT)
    if (!photos.length) { skippedNotTalent++; return }   // a card with no face is not a card
    talent.push({
      external_id: String(p.id ?? p.handle),
      name: title,
      division: divisionOf(type, tags),
      cities: citiesOf(tags),
      bio: plainText(p?.body_html ?? ''),
      photos,
      profile_url: `${origin}/products/${encodeURIComponent(String(p.handle))}`,
      sort_order: i,
    })
  })
  return { talent, skippedMinor, skippedNotTalent }
}
