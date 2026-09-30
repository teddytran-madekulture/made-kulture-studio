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
  enabled: boolean
  title: string            // e.g. SAPEUR EN ROSE
  subtitle: string         // e.g. Dark Grandiose
  setName: string          // optional "Shot on Set D"
  postUrl: string          // the Instagram post
  credits: EditorialCredit[]  // first one is the byline under the title
  photos: string[]         // public URLs in the 'site' bucket, in order
  intervalSec: number      // crossfade timing
  updatedAt: string | null
}

export const EDITORIAL_DEFAULTS: FeaturedEditorial = {
  enabled: false, title: '', subtitle: '', setName: '', postUrl: '',
  credits: [], photos: [], intervalSec: 5, updatedAt: null,
}

export const EDITORIAL_MAX_PHOTOS = 12
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
  return {
    enabled: !!x.enabled,
    title: str(x.title, 80),
    subtitle: str(x.subtitle, 80),
    setName: str(x.setName, 40),
    postUrl: safeLink(x.postUrl),
    credits,
    photos,
    intervalSec: Number.isFinite(iv) ? Math.min(15, Math.max(3, Math.round(iv))) : EDITORIAL_DEFAULTS.intervalSec,
    updatedAt: x.updatedAt ? str(x.updatedAt, 40) : null,
  }
}

export function parseStored(raw: unknown): FeaturedEditorial {
  if (!raw) return { ...EDITORIAL_DEFAULTS }
  try { return sanitize(typeof raw === 'string' ? JSON.parse(raw) : raw) } catch { return { ...EDITORIAL_DEFAULTS } }
}

// What the home page should actually show: null ⇒ fall back to the plain
// studio photo slot. Switched on but with no photos counts as off.
export function liveEditorial(e: FeaturedEditorial | null | undefined): FeaturedEditorial | null {
  return e && e.enabled && e.photos.length > 0 ? e : null
}
