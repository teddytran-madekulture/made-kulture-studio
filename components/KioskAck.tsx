'use client'

// Marks a kiosk ring as answered when Teddy actually engages the admin — on
// mount (he opened it) and when he switches back to it (focus/visibility). It
// does NOT ack on a loop, so a ring that arrives while the app is merely open
// still keeps escalating until he taps a notification (handled in sw.js) or
// re-opens/returns to the admin. Point: nag until answered, not until "app open".

import { useEffect } from 'react'

export default function KioskAck() {
  useEffect(() => {
    const ack = () => {
      if (document.visibilityState !== 'visible') return
      fetch('/api/admin/kiosk-ack', { method: 'POST', cache: 'no-store' }).catch(() => {})
    }
    ack() // opening the admin counts as answering
    const onVis = () => ack()
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onVis)
    }
  }, [])
  return null
}
