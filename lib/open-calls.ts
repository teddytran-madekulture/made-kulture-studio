// Open Calls (migration 149) — featured-editorial submissions tied to a
// temporary set. Pure + dependency-free so the public page, the admin page and
// the API routes share one idea of "what phase is this call in".
//
// ⚠️ Nothing a member uploads is public until Teddy shortlists it. Images live
// in the PRIVATE bucket below and are only ever shown through signed URLs.

export const OPEN_CALL_BUCKET = 'open-call-media'
export const OPEN_CALL_MIN_IMAGES = 3
export const OPEN_CALL_MAX_CREDITS = 10
// Submission requirement: originals at least this many px on the long side.
export const OPEN_CALL_MIN_EDGE = 2000
// Long edge after the browser shrinks a photo. Big enough to run as a featured
// editorial, small enough (~1–2 MB) that a phone on studio wifi gets it up.
export const OPEN_CALL_IMAGE_EDGE = 2400

export type OpenCallPhase = 'draft' | 'upcoming' | 'open' | 'reviewing' | 'voting' | 'decided'
export type SubmissionStatus = 'pending' | 'shortlisted' | 'declined' | 'winner' | 'withdrawn'

export interface OpenCall {
  id: string
  slug: string
  title: string
  tagline: string | null
  set_slug: string | null
  set_name: string | null
  prize: string | null
  cover_url: string | null
  opens_at: string
  closes_at: string | null
  voting_opens_at: string | null
  voting_closes_at: string | null
  max_images: number
  status: string
  rolling: boolean
}

export interface OpenCallCredit { role: string; name: string; handle: string }

// Status overrides the clock in two places only: a draft is never live, and a
// decided call is over. Everything else follows the dates, so nobody has to
// remember to flip a switch at midnight on Oct 31.
// A rolling call (no closes_at) stays open until it is set to closed/decided.
export function openCallPhase(c: Pick<OpenCall, 'status' | 'opens_at' | 'closes_at' | 'voting_opens_at' | 'voting_closes_at'>, now = new Date()): OpenCallPhase {
  if (c.status === 'draft') return 'draft'
  if (c.status === 'decided') return 'decided'
  // 'announced' = on the page as TBA (Winter Is Coming), no dates, no form yet.
  if (c.status === 'announced') return 'upcoming'
  const t = now.getTime()
  if (t < new Date(c.opens_at).getTime()) return 'upcoming'
  if (c.status !== 'closed' && (!c.closes_at || t <= new Date(c.closes_at).getTime())) return 'open'
  if (!c.closes_at) return 'decided'
  const vo = c.voting_opens_at ? new Date(c.voting_opens_at).getTime() : null
  const vc = c.voting_closes_at ? new Date(c.voting_closes_at).getTime() : null
  if (vo != null && t >= vo && (vc == null || t <= vc)) return 'voting'
  if (vc != null && t > vc) return 'decided'
  return 'reviewing'
}

// Studio time, always through Intl — the server runs UTC.
export function centralDate(iso: string, opts: Intl.DateTimeFormatOptions = { month: 'long', day: 'numeric' }): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', ...opts }).format(new Date(iso))
}

export function cleanHandle(s: string): string {
  return String(s || '').trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@+/, '').replace(/[/?#].*$/, '').replace(/[^A-Za-z0-9._]/g, '').slice(0, 30)
}

export function cleanCredits(raw: unknown): OpenCallCredit[] {
  if (!Array.isArray(raw)) return []
  return raw.slice(0, OPEN_CALL_MAX_CREDITS).map((c: any) => ({
    role: String(c?.role ?? '').trim().slice(0, 40),
    name: String(c?.name ?? '').trim().slice(0, 80),
    handle: cleanHandle(c?.handle ?? ''),
  })).filter(c => c.role && (c.name || c.handle))
}

// ── Duplicate detection (migration 152) ────────────────────────────────────
// dHash: 64 bits as 16 hex chars. Bits apart ≤ this ⇒ treat as the same image.
export const HASH_MATCH_BITS = 5

export function hashDistance(a: string, b: string): number {
  if (!/^[0-9a-f]{16}$/.test(a) || !/^[0-9a-f]{16}$/.test(b)) return 64
  let x = BigInt('0x' + a) ^ BigInt('0x' + b), n = 0
  while (x) { n += Number(x & BigInt(1)); x >>= BigInt(1) }
  return n
}

/** How many images in `mine` match an image in `theirs`. */
export function matchingImages(mine: string[], theirs: string[]): number {
  return mine.filter(h => theirs.some(t => hashDistance(h, t) <= HASH_MATCH_BITS)).length
}
