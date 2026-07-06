'use client'

// Tells the server "Teddy is looking at the admin right now" so the escalating
// kiosk-ring push loop stops. Pings on mount, whenever the tab becomes visible,
// and on a slow heartbeat while visible. When the admin is closed/backgrounded,
// pings stop — so a new ring keeps escalating until he opens the app.

import { useEffect } from 'react'

const HEARTBEAT_MS = 25_000

export default function KioskAck() {
  useEffect(() => {
    const ack = () => {
      if (document.visibilityState !== 'visible') return
      fetch('/api/admin/kiosk-ack', { method: 'POST', cache: 'no-store' }).catch(() => {})
    }
    ack()
    const onVis = () => ack()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    const iv = setInterval(ack, HEARTBEAT_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onVis)
      clearInterval(iv)
    }
  }, [])
  return null
}
