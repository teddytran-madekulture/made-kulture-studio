// Marketing Tools — announcement bar, promotional pop-up, mobile info bar.
// Edited at /admin/website/marketing; stored as ONE JSON row in site_settings
// (key 'marketing_tools') — no migration needed. The public site reads only the
// ACTIVE pieces from /api/site/marketing (CDN-cached ~60s).
//
// Each piece has an optional start/end window, so a holiday promo can be set up
// ahead of time and switch itself on and off.

export type Theme = 'gold' | 'black' | 'red' | 'white'

export interface Announcement {
  enabled: boolean; text: string; linkLabel: string; linkUrl: string
  theme: Theme; startAt: string | null; endAt: string | null
}
export interface Popup {
  enabled: boolean; headline: string; body: string; buttonLabel: string; buttonUrl: string
  delaySec: number; frequency: 'once' | 'session' | 'always'; pages: 'all' | 'home'
  startAt: string | null; endAt: string | null
}
export interface MobileBar {
  enabled: boolean; text: string; buttonLabel: string; buttonUrl: string
  startAt: string | null; endAt: string | null
}
export interface MarketingTools { announcement: Announcement; popup: Popup; mobileBar: MobileBar; updatedAt: string | null }

export const MARKETING_DEFAULTS: MarketingTools = {
  announcement: { enabled: false, text: '', linkLabel: '', linkUrl: '', theme: 'gold', startAt: null, endAt: null },
  popup: { enabled: false, headline: '', body: '', buttonLabel: '', buttonUrl: '', delaySec: 3, frequency: 'once', pages: 'all', startAt: null, endAt: null },
  mobileBar: { enabled: false, text: '', buttonLabel: '', buttonUrl: '', startAt: null, endAt: null },
  updatedAt: null,
}

export const THEMES: Record<Theme, { bg: string; fg: string; link: string }> = {
  gold:  { bg: '#d4a843', fg: '#080808', link: '#080808' },
  black: { bg: '#080808', fg: '#ffffff', link: '#d4a843' },
  red:   { bg: '#b3261e', fg: '#ffffff', link: '#ffffff' },
  white: { bg: '#ffffff', fg: '#080808', link: '#080808' },
}

// Paths where none of this ever shows: staff tools, and mid-checkout flows where
// a pop-up would get in the way of paying.
const HIDDEN_PREFIXES = [
  '/admin', '/desk', '/checkin', '/kiosk', '/tour-admin', '/t', '/jukebox', '/staff', '/work', '/concept-review', '/review',
  '/book', '/pay', '/manage', '/extend', '/short-notice', '/portal', '/reschedule',
  '/login', '/signup', '/forgot-password', '/auth', '/account',   // already doing the thing the message asks
]
export function hiddenOnPath(path: string | null | undefined): boolean {
  const p = path || '/'
  return HIDDEN_PREFIXES.some(x => p === x || p.startsWith(x + '/'))
}

export function inWindow(item: { startAt: string | null; endAt: string | null }, now = Date.now()): boolean {
  if (item.startAt && Date.parse(item.startAt) > now) return false
  if (item.endAt && Date.parse(item.endAt) <= now) return false
  return true
}

// Only relative links or http(s)/mailto/tel — never javascript: or data:.
export function safeUrl(u: unknown): string {
  const s = String(u ?? '').trim().slice(0, 500)
  if (!s) return ''
  if (s.startsWith('/') && !s.startsWith('//')) return s
  if (/^(https?:\/\/|mailto:|tel:)/i.test(s)) return s
  return ''
}

const str = (v: unknown, max: number) => String(v ?? '').slice(0, max)
const iso = (v: unknown): string | null => { const s = String(v ?? '').trim(); if (!s) return null; const t = Date.parse(s); return Number.isFinite(t) ? new Date(t).toISOString() : null }

// Everything that reaches the DB or the public page passes through here.
export function sanitize(input: any): MarketingTools {
  const a = input?.announcement ?? {}, p = input?.popup ?? {}, m = input?.mobileBar ?? {}
  const theme: Theme = (['gold', 'black', 'red', 'white'] as const).includes(a.theme) ? a.theme : 'gold'
  return {
    announcement: {
      enabled: !!a.enabled, text: str(a.text, 200), linkLabel: str(a.linkLabel, 40), linkUrl: safeUrl(a.linkUrl),
      theme, startAt: iso(a.startAt), endAt: iso(a.endAt),
    },
    popup: {
      enabled: !!p.enabled, headline: str(p.headline, 80), body: str(p.body, 600), buttonLabel: str(p.buttonLabel, 40), buttonUrl: safeUrl(p.buttonUrl),
      delaySec: Math.min(30, Math.max(0, Math.round(Number(p.delaySec) || 0))),
      frequency: (['once', 'session', 'always'] as const).includes(p.frequency) ? p.frequency : 'once',
      pages: p.pages === 'home' ? 'home' : 'all',
      startAt: iso(p.startAt), endAt: iso(p.endAt),
    },
    mobileBar: {
      enabled: !!m.enabled, text: str(m.text, 80), buttonLabel: str(m.buttonLabel, 24), buttonUrl: safeUrl(m.buttonUrl),
      startAt: iso(m.startAt), endAt: iso(m.endAt),
    },
    updatedAt: iso(input?.updatedAt),
  }
}

export function parseStored(raw: string | null | undefined): MarketingTools {
  if (!raw) return { ...MARKETING_DEFAULTS }
  try { return sanitize(JSON.parse(raw)) } catch { return { ...MARKETING_DEFAULTS } }
}

// What the public site gets: only pieces that are on, have content, and are in their window.
export function activeOnly(t: MarketingTools, now = Date.now()) {
  const a = t.announcement, p = t.popup, m = t.mobileBar
  return {
    announcement: a.enabled && a.text && inWindow(a, now) ? { text: a.text, linkLabel: a.linkLabel, linkUrl: a.linkUrl, theme: a.theme } : null,
    popup: p.enabled && (p.headline || p.body) && inWindow(p, now)
      ? { headline: p.headline, body: p.body, buttonLabel: p.buttonLabel, buttonUrl: p.buttonUrl, delaySec: p.delaySec, frequency: p.frequency, pages: p.pages, version: t.updatedAt || '0' }
      : null,
    mobileBar: m.enabled && m.text && inWindow(m, now) ? { text: m.text, buttonLabel: m.buttonLabel, buttonUrl: m.buttonUrl, version: t.updatedAt || '0' } : null,
  }
}
export type ActiveMarketing = ReturnType<typeof activeOnly>
