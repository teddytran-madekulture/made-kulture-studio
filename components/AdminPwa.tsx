'use client'

// Registers the admin service worker (PWA + Web Push). Mounted by app/admin/layout.tsx.

import { useEffect, useState } from 'react'

export default function AdminPwa() {
  // ⚠️ Stale-build guard. An installed PWA keeps its page alive across
  // backgrounding, so the running JavaScript can be WEEKS old with nothing on
  // screen to say so. On 2026-08-13 this admin app was running code from four
  // weeks earlier: the short-notice banner showed no price and no charge button,
  // so every approval would have silently taken the no-charge path.
  //
  // A stale app that still WORKS is worse than one that breaks — you trust it.
  const [stale, setStale] = useState(false)

  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/admin' }).catch(() => {})
    }

    // Keep the app-icon badge honest: on open/focus, re-count what's pending.
    const syncBadge = async () => {
      if (!('setAppBadge' in navigator)) return
      try {
        const r = await fetch('/api/admin/badge')
        if (!r.ok) return
        const d = await r.json()
        if (d.count > 0) await (navigator as any).setAppBadge(d.count)
        else await (navigator as any).clearAppBadge()
      } catch {}
    }
    // The build this page was loaded with, captured on first check. Every later
    // check compares against it — a difference means a deploy landed underneath.
    let loadedBuild: string | null = null
    const checkBuild = async () => {
      try {
        const r = await fetch('/api/version', { cache: 'no-store' })
        if (!r.ok) return
        const { build } = await r.json()
        if (!build || build === 'dev') return          // no sha in dev — never nag
        if (loadedBuild === null) { loadedBuild = build; return }
        if (build !== loadedBuild) setStale(true)
      } catch { /* offline — say nothing */ }
    }

    syncBadge(); checkBuild()
    const onVis = () => {
      if (document.visibilityState === 'visible') { syncBadge(); checkBuild() }
    }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])

  if (!stale) return null

  return (
    <button
      onClick={() => window.location.reload()}
      style={{
        position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 9999,
        background: '#d4a843', color: '#080808', border: 'none',
        padding: '14px 16px', width: '100%', cursor: 'pointer',
        fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 600, letterSpacing: '0.06em',
        boxShadow: '0 -6px 24px rgba(0,0,0,0.5)',
      }}
    >
      New version available — tap to reload
    </button>
  )
}

// Helper used by the "Enable notifications" button (inbox header).
export async function enablePush(): Promise<'ok' | 'denied' | 'unsupported' | 'error'> {
  try {
    if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
      return 'unsupported'
    }
    const perm = await Notification.requestPermission()
    if (perm !== 'granted') return 'denied'

    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/admin' })
    await navigator.serviceWorker.ready

    const vapid = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapid) return 'error'
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapid),
    })

    const res = await fetch('/api/admin/push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subscription: sub.toJSON(), userAgent: navigator.userAgent }),
    })
    return res.ok ? 'ok' : 'error'
  } catch {
    return 'error'
  }
}

function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const raw = window.atob(base64)
  const arr = new Uint8Array(raw.length)
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}
