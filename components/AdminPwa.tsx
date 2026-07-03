'use client'

// Registers the admin service worker (PWA + Web Push). Mounted by app/admin/layout.tsx.

import { useEffect } from 'react'

export default function AdminPwa() {
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
    syncBadge()
    const onVis = () => { if (document.visibilityState === 'visible') syncBadge() }
    document.addEventListener('visibilitychange', onVis)
    return () => document.removeEventListener('visibilitychange', onVis)
  }, [])
  return null
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
