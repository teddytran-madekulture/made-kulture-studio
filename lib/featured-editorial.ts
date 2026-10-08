// Featured Editorial — the photo spot in the home page's "Built for the
// Obsessed" section, used to showcase a customer's shoot made at the studio.
// Edited at /admin/website/editorial; stored as ONE JSON row in site_settings
// (key 'featured_editorial') — same pattern as Marketing Tools, no migration.
//
// Pure + dependency-free so the admin editor (client) and the home page share
// the same shape and the same sanitiser. Server read: featured-editorial-server.ts.
//
// ⚠️ Only feature work the creators have cleared for our use (Teddy's rule:
// what's on the Made Kulture Instagram feed is collab/permissioned). Credit
// every handle — the credits line IS the permission's other half.

export interface EditorialCredit { role: string; handle: string }

export interface FeaturedEditorial {
  id: string
  enabled: boolean
  pinned: boolean          // pinned ⇒ this one shows everywhere, rotation paused
  startDate: string | null // 'YYYY-MM-DD' Central, inclusive (optional)
  endDate: string | null   // 'YYYY-MM-DD' Central, inclusive (optional)
  title: string            // e.g. SAPEUR EN ROSE
  subtitle: string         // e.g. Dark Grandiose
  setName: string          // optional "Shot on Set D" (display name)
  setSlug: string          // the set's slug, for the BOOK button (blank = no button)
  showInHero: boolean      // also run as a slide in the home hero carousel
  postUrl: string          // the Instagram post
  // Kiosk promo (2026-10-08): turn an editorial into an ad, e.g. The Patient →
  // "OPEN CALL · SUBMIT BY NOV 30" with the QR going to /submissions. Blank = normal.
  promoLabel: string       // replaces "FEATURED EDITORIAL" above the title
  promoUrl: string         // the QR goes here instead of the post
  promoCta: string         // caption under the QR (default "SEE THE POST")
  promoHeadline: string    // big ad text over the photo (newlines = line breaks); blank = title
  promoText: string        // one line under the ad headline
  credits: EditorialCredit[]  // first one is the byline under the title
  photos: string[]         // public URLs in the 'site' bucket, in order
  intervalSec: number      // crossfade timing
  updatedAt: string | null
}

export const EDITORIAL_DEFAULTS: FeaturedEditorial = {
  id: 'e0', pinned: false, startDate: null, endDate: null,
  enabled: false, title: '', subtitle: '', setName: '', setSlug: '', showInHero: false, postUrl: '', promoLabel: '', promoUrl: '', promoCta: '', promoHeadline: '', promoText: '',
  credits: [], photos: [], intervalSec: 5, updatedAt: null,
}

export const EDITORIAL_MAX_PHOTOS = 12
export const EDITORIAL_MAX_ITEMS = 24
export const EDITORIAL_MAX_CREDITS = 10

const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max)

// Only relative links or http(s) — never javascript: or data:.
export function safeLink(u: unknown): string {
  const s = str(u, 500)
  if (!s) return ''
  if (s.startsWith('/') && !s.startsWith('//')) return s
  if (/^https?:\/\//i.test(s)) return s
  return ''
}

// "@john_aileru", "john_aileru" or a full profile URL → "john_aileru".
export function cleanHandle(v: unknown): string {
  let s = str(v, 200)
  const m = s.match(/instagram\.com\/([A-Za-z0-9._]+)/i)
  if (m) s = m[1]
  return s.replace(/^@+/, '').replace(/[^A-Za-z0-9._]/g, '').slice(0, 30)
}

export const handleUrl = (h: string) => `https://www.instagram.com/${h}/`

export function sanitize(input: any): FeaturedEditorial {
  const x = input && typeof input === 'object' ? input : {}
  const photos = Array.isArray(x.photos)
    ? x.photos.map((p: unknown) => safeLink(p)).filter((p: string) => /^https:\/\//i.test(p)).slice(0, EDITORIAL_MAX_PHOTOS)
    : []
  const credits = Array.isArray(x.credits)
    ? x.credits
        .map((c: any) => ({ role: str(c?.role, 40), handle: cleanHandle(c?.handle) }))
        .filter((c: EditorialCredit) => c.role || c.handle)
        .slice(0, EDITORIAL_MAX_CREDITS)
    : []
  const iv = Number(x.intervalSec)
  const day = (v: unknown): string | null => { const d = String(v ?? '').trim(); return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null }
  let startDate = day(x.startDate), endDate = day(x.endDate)
  if (startDate && endDate && endDate < startDate) [startDate, endDate] = [endDate, startDate]
  return {
    id: str(x.id, 40).replace(/[^a-zA-Z0-9_-]/g, '') || `e${Math.random().toString(36).slice(2, 9)}`,
    pinned: !!x.pinned,
    startDate, endDate,
    enabled: !!x.enabled,
    title: str(x.title, 80),
    subtitle: str(x.subtitle, 80),
    setName: str(x.setName, 40),
    setSlug: str(x.setSlug, 60).toLowerCase().replace(/[^a-z0-9-]/g, ''),
    showInHero: !!x.showInHero,
    postUrl: safeLink(x.postUrl),
    promoLabel: str(x.promoLabel, 48),
    promoUrl: safeLink(x.promoUrl),
    promoCta: str(x.promoCta, 24),
    promoHeadline: str(x.promoHeadline, 80),
    promoText: str(x.promoText, 200),
    credits,
    photos,
    intervalSec: Number.isFinite(iv) ? Math.min(15, Math.max(3, Math.round(iv))) : EDITORIAL_DEFAULTS.intervalSec,
    updatedAt: x.updatedAt ? str(x.updatedAt, 40) : null,
  }
}

// ── The list (2026-09-30) ─────────────────────────────────────────────────
// Stored as { items: [...] } in the same site_settings row. A row saved before
// the list existed holds ONE editorial object — it is read as a list of one,
// so nothing needs migrating.
export interface EditorialsConfig { items: FeaturedEditorial[]; updatedAt: string | null }

export function sanitizeConfig(input: any): EditorialsConfig {
  const raw: any[] = Array.isArray(input?.items) ? input.items : (input && typeof input === 'object' && !Array.isArray(input) && ('photos' in input || 'title' in input)) ? [input] : []
  const seen = new Set<string>()
  const items: FeaturedEditorial[] = []
  for (const x of raw.slice(0, EDITORIAL_MAX_ITEMS)) {
    const e = sanitize(x)
    while (seen.has(e.id)) e.id = `e${Math.random().toString(36).slice(2, 9)}`
    seen.add(e.id); items.push(e)
  }
  // Only one pin can win; keep the first.
  let pinned = false
  for (const e of items) { if (e.pinned && !pinned) pinned = true; else e.pinned = false }
  return { items, updatedAt: typeof input?.updatedAt === 'string' ? input.updatedAt.slice(0, 40) : null }
}

export function parseStoredConfig(raw: unknown): EditorialsConfig {
  if (!raw) return { items: [], updatedAt: null }
  try { return sanitizeConfig(typeof raw === 'string' ? JSON.parse(raw) : raw) } catch { return { items: [], updatedAt: null } }
}

/** Today's date in Houston as 'YYYY-MM-DD' — never a UTC day. */
export function centralToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(now)
}

export type EditorialStatus = 'live' | 'off' | 'incomplete' | 'scheduled' | 'ended'
export function editorialStatus(e: FeaturedEditorial, today: string): EditorialStatus {
  if (!e.enabled) return 'off'
  if (!e.photos.length) return 'incomplete'
  if (e.startDate && today < e.startDate) return 'scheduled'
  if (e.endDate && today > e.endDate) return 'ended'
  return 'live'
}

/** What is in rotation right now. A live PINNED editorial replaces the rotation. */
export function liveEditorials(cfg: EditorialsConfig, today: string): FeaturedEditorial[] {
  const live = cfg.items.filter(e => editorialStatus(e, today) === 'live')
  const pin = live.find(e => e.pinned)
  return pin ? [pin] : live
}

// Single-editorial guard used by the home page components: null ⇒ fall back
// to the plain studio photo slot.
export function liveEditorial(e: FeaturedEditorial | null | undefined): FeaturedEditorial | null {
  return e && e.enabled && e.photos.length > 0 ? e : null
}

// The credits after the byline, as one compact line for the hero banner.
export function creditsLine(e: FeaturedEditorial, max = 3): string {
  return e.credits.slice(1, 1 + max).filter(c => c.handle).map(c => `${c.role ? c.role + ' ' : ''}@${c.handle}`).join('  ·  ')
}
