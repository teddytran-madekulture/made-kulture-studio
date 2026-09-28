// Home-page hero carousel — extra banners that swipe in after the main hero.
//
// Slide 1 is ALWAYS the existing hero (its photo slot + the Hero text fields in
// the Website Editor), so nothing about today's home page changes until a slide
// is added. Extra slides live as ONE JSON row in site_settings (key
// 'hero_slides') — no migration, same pattern as lib/marketing-tools.ts.
//
// Pure + client-safe (no Supabase import): the home page, the editor and the
// API all share these rules. Server fetch lives in lib/hero-slides-server.ts.
//
// ⚠️ Dates are plain Central calendar days ('YYYY-MM-DD'), compared against
// TODAY IN HOUSTON — never a UTC instant. A "starts Oct 1" slide must appear at
// midnight Central, not at 7pm the night before (the UTC-read bug again).

export type Focal = 'left' | 'center' | 'right'

export interface HeroSlide {
  id: string
  enabled: boolean
  imageUrl: string
  focal: Focal               // which part of the photo stays in frame on phones
  eyebrow: string
  headline: string           // one line per row, big display font
  paragraph: string
  buttonLabel: string
  buttonUrl: string
  button2Label: string       // optional second button (blank = hidden)
  button2Url: string
  startDate: string | null   // 'YYYY-MM-DD' Central, inclusive
  endDate: string | null     // 'YYYY-MM-DD' Central, inclusive
}

export interface HeroSlidesConfig {
  slides: HeroSlide[]
  intervalSec: number        // auto-advance speed
  updatedAt: string | null
}

export const MAX_SLIDES = 8
export const INTERVAL_MIN = 4
export const INTERVAL_MAX = 15
export const HERO_SLIDES_DEFAULTS: HeroSlidesConfig = { slides: [], intervalSec: 7, updatedAt: null }

export function blankSlide(id: string): HeroSlide {
  return {
    id, enabled: true, imageUrl: '', focal: 'center',
    eyebrow: '', headline: '', paragraph: '', buttonLabel: '', buttonUrl: '',
    button2Label: '', button2Url: '', startDate: null, endDate: null,
  }
}

// Only relative links or http(s) — never javascript: or data:.
export function safeUrl(u: unknown): string {
  const s = String(u ?? '').trim().slice(0, 500)
  if (!s) return ''
  if (s.startsWith('/') && !s.startsWith('//')) return s
  if (/^https?:\/\//i.test(s)) return s
  return ''
}

// Slide photos must come from our own Supabase storage (the upload route puts
// them there). Anything else is dropped rather than hot-linked.
export function safeImageUrl(u: unknown): string {
  const s = String(u ?? '').trim().slice(0, 600)
  return /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\//i.test(s) ? s : ''
}

const str = (v: unknown, max: number) => String(v ?? '').replace(/\r/g, '').slice(0, max)
const day = (v: unknown): string | null => {
  const s = String(v ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

// Everything that reaches the DB or the public page passes through here.
export function sanitize(input: any): HeroSlidesConfig {
  const raw: any[] = Array.isArray(input?.slides) ? input.slides : []
  const seen = new Set<string>()
  const slides: HeroSlide[] = []
  for (const s of raw.slice(0, MAX_SLIDES)) {
    let id = str(s?.id, 40).replace(/[^a-zA-Z0-9_-]/g, '')
    if (!id || seen.has(id)) id = `s${slides.length}-${Math.random().toString(36).slice(2, 8)}`
    seen.add(id)
    let startDate = day(s?.startDate), endDate = day(s?.endDate)
    // A backwards window would silently hide the slide forever — swap it.
    if (startDate && endDate && endDate < startDate) [startDate, endDate] = [endDate, startDate]
    slides.push({
      id,
      enabled: !!s?.enabled,
      imageUrl: safeImageUrl(s?.imageUrl),
      focal: (['left', 'center', 'right'] as const).includes(s?.focal) ? s.focal : 'center',
      eyebrow: str(s?.eyebrow, 80),
      headline: str(s?.headline, 80),
      paragraph: str(s?.paragraph, 300),
      buttonLabel: str(s?.buttonLabel, 40),
      buttonUrl: safeUrl(s?.buttonUrl),
      button2Label: str(s?.button2Label, 40),
      button2Url: safeUrl(s?.button2Url),
      startDate, endDate,
    })
  }
  const n = Math.round(Number(input?.intervalSec))
  return {
    slides,
    intervalSec: Number.isFinite(n) ? Math.min(INTERVAL_MAX, Math.max(INTERVAL_MIN, n)) : HERO_SLIDES_DEFAULTS.intervalSec,
    updatedAt: typeof input?.updatedAt === 'string' ? input.updatedAt.slice(0, 40) : null,
  }
}

export function parseStored(raw: string | null | undefined): HeroSlidesConfig {
  if (!raw) return { ...HERO_SLIDES_DEFAULTS, slides: [] }
  try { return sanitize(JSON.parse(raw)) } catch { return { ...HERO_SLIDES_DEFAULTS, slides: [] } }
}

/** Today's date in Houston as 'YYYY-MM-DD'. */
export function centralToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(now)
}

export type SlideStatus = 'live' | 'off' | 'scheduled' | 'ended' | 'incomplete'

/** Why a slide is or isn't showing — the editor prints this next to each one. */
export function slideStatus(s: HeroSlide, today: string): SlideStatus {
  if (!s.enabled) return 'off'
  if (!s.imageUrl || !s.headline.trim()) return 'incomplete'
  if (s.startDate && today < s.startDate) return 'scheduled'
  if (s.endDate && today > s.endDate) return 'ended'
  return 'live'
}

/** The slides the public home page shows right now, in order. */
export function activeSlides(cfg: HeroSlidesConfig, today: string): HeroSlide[] {
  return cfg.slides.filter(s => slideStatus(s, today) === 'live')
}

export const FOCAL_POSITION: Record<Focal, string> = {
  left: '25% center', center: 'center center', right: '75% center',
}
