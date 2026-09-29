'use client'
// Community analytics — tiny client-side queue for /api/track.
//
// track('profile_view', { target_id }) just pushes onto a queue; the queue
// flushes every 5s, when it reaches 10 events, or when the tab is hidden /
// closed (sendBeacon, so a click that navigates away still gets recorded).
// No polling: nothing is sent unless the member actually did something.
// Never throws — analytics must not break a page.

export type TrackType =
  | 'search' | 'filter' | 'profile_view' | 'portfolio_seen' | 'portfolio_open'
  | 'contact_click' | 'casting_view' | 'casting_apply' | 'casting_list_view'

type Ev = { type: TrackType; target_id?: string; query?: string; meta?: Record<string, string | number | boolean> }

const queue: Ev[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let hooked = false

function send(useBeacon: boolean) {
  if (timer) { clearTimeout(timer); timer = null }
  if (!queue.length) return
  const body = JSON.stringify({ events: queue.splice(0, queue.length) })
  try {
    if (useBeacon && typeof navigator !== 'undefined' && navigator.sendBeacon) {
      navigator.sendBeacon('/api/track', new Blob([body], { type: 'application/json' }))
    } else {
      fetch('/api/track', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true }).catch(() => {})
    }
  } catch { /* ignore */ }
}

function hook() {
  if (hooked || typeof window === 'undefined') return
  hooked = true
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') send(true) })
  window.addEventListener('pagehide', () => send(true))
}

export function track(type: TrackType, data: Omit<Ev, 'type'> = {}) {
  try {
    hook()
    queue.push({ type, ...data })
    if (queue.length >= 10) send(false)
    else if (!timer) timer = setTimeout(() => send(false), 5000)
  } catch { /* ignore */ }
}

// For clicks that leave the page (Instagram, mailto, external links): send now.
export function trackNow(type: TrackType, data: Omit<Ev, 'type'> = {}) {
  track(type, data)
  send(true)
}
