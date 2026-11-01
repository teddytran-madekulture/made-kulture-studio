'use client'
// Site traffic — page views for Admin → Insights → Traffic (migration 182).
//
// One tiny queue per tab. A view is pushed when the path changes; the queue is
// sent with sendBeacon when the tab is hidden or closed, or once it holds 10
// views, or 30s after the first unsent one. NO polling: a visitor who does
// nothing sends nothing (see the jukebox CPU note before changing that).
//
// Privacy: a random visitor id in localStorage, a random visit id in
// sessionStorage, the path with token segments masked, and the referring HOST
// only. Never a name, email, query string or IP. Never throws.

import { maskPath } from '@/lib/pageview-path'

type View = { path: string; kind: 'view' | 'booked'; ref?: string; utm?: string }

// Staff/kiosk surfaces and anything that isn't a visitor looking at the site.
const SKIP = [/^\/admin/, /^\/kiosk/, /^\/desk/, /^\/staff/, /^\/jukebox\/player/, /^\/t\//, /^\/projector/, /^\/api\//, /^\/tour-admin/]

const queue: View[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let hooked = false
let firstOfVisit = true

function rid(): string {
  try { return crypto.randomUUID() } catch { return Math.random().toString(36).slice(2) + Date.now().toString(36) }
}
function store(kind: 'local' | 'session', key: string): string {
  try {
    const s = kind === 'local' ? localStorage : sessionStorage
    let v = s.getItem(key)
    if (!v) { v = rid(); s.setItem(key, v) }
    return v
  } catch { return rid() }
}
function platform(): 'web' | 'ios' | 'android' {
  try {
    const c = (window as any).Capacitor
    if (c?.isNativePlatform?.()) return c.getPlatform?.() === 'android' ? 'android' : 'ios'
  } catch {}
  return 'web'
}

function send(useBeacon: boolean) {
  if (timer) { clearTimeout(timer); timer = null }
  if (!queue.length) return
  const body = JSON.stringify({ vid: store('local', 'mk_vid'), sid: store('session', 'mk_sid'), platform: platform(), views: queue.splice(0, queue.length) })
  try {
    if (useBeacon && navigator.sendBeacon) navigator.sendBeacon('/api/track/pv', new Blob([body], { type: 'application/json' }))
    else fetch('/api/track/pv', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {})
  } catch { /* analytics never breaks a page */ }
}
function hook() {
  if (hooked) return
  hooked = true
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') send(true) })
  window.addEventListener('pagehide', () => send(true))
}
function push(v: View) {
  if (typeof window === 'undefined') return
  hook()
  queue.push(v)
  if (queue.length >= 10) send(false)
  else if (!timer) timer = setTimeout(() => send(false), 30000)
}

export function trackPageView(pathname: string) {
  try {
    if (SKIP.some(r => r.test(pathname))) return
    const v: View = { path: maskPath(pathname), kind: 'view' }
    if (firstOfVisit) {
      firstOfVisit = false
      // Only the first view of a tab session carries where they came from.
      if (!sessionStorage.getItem('mk_sid_ref')) {
        sessionStorage.setItem('mk_sid_ref', '1')
        try {
          const host = document.referrer ? new URL(document.referrer).hostname : ''
          if (host && host !== location.hostname) v.ref = host.replace(/^www\./, '').slice(0, 80)
        } catch {}
        const q = new URLSearchParams(location.search)
        const utm = q.get('utm_source') || q.get('ref')
        if (utm) v.utm = utm.toLowerCase().slice(0, 40)
      }
    }
    push(v)
  } catch {}
}

/** A completed booking — lets Traffic show which visits turned into bookings. */
export function trackBooked() {
  try { push({ path: '/book', kind: 'booked' }); send(true) } catch {}
}
