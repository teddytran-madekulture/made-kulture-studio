'use client'

// The kiosk ring banner — "someone is standing at a tablet waiting for you".
//
// ⚠️ THIS FILE USED TO DO THE OPPOSITE OF ITS JOB. It POSTed /api/admin/kiosk-ack
// on mount and on every focus/visibility change, so merely opening the admin
// marked a ring as answered and stopped the escalating pushes — even if Teddy
// opened it to check the calendar and never saw the ring at all. Meanwhile the
// guest's tablet had already printed "Someone's on the way" the instant they
// tapped. Both ends were confident and nobody was coming.
//
// Now: this only READS. The ring is answered by one explicit tap of ON MY WAY
// (here, or the matching action on the notification in sw.js) — and the guest's
// tablet is polling for exactly that, so the words on their screen change only
// when a human actually commits.
//
// Polling cost: /api/admin/kiosk-ack GET is a 3-row studio_settings read, runs
// ONLY while the tab is visible, and only for Teddy. That is nothing like the
// jukebox poll (two always-on tablets at 5s = 78% of all Vercel compute), but
// keep the visibility guard — an admin tab left open for a week is the same
// shape of mistake.

import { useCallback, useEffect, useRef, useState } from 'react'

const POLL_MS = 15_000
const CHAMP = '#c9b27e'

interface Ring { ringing: boolean; place: string; waitedSec: number; goneQuiet: boolean }

export default function KioskAck() {
  const [ring, setRing] = useState<Ring | null>(null)
  const [sending, setSending] = useState(false)
  const [justSent, setJustSent] = useState(false)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  const check = useCallback(async () => {
    if (document.visibilityState !== 'visible') return
    try {
      const r = await fetch('/api/admin/kiosk-ack', { cache: 'no-store' })
      if (!r.ok) return                      // 401 on the login page is expected
      const j = await r.json()
      setRing(j)
      if (!j.ringing) setJustSent(false)     // ring cleared — arm for the next one
    } catch { /* offline: keep the last known state rather than hiding the banner */ }
  }, [])

  useEffect(() => {
    check()
    timer.current = setInterval(check, POLL_MS)
    const onVis = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => {
      if (timer.current) clearInterval(timer.current)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onVis)
    }
  }, [check])

  const onMyWay = async () => {
    if (sending) return
    setSending(true)
    try {
      const r = await fetch('/api/admin/kiosk-ack', { method: 'POST', cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      // Read the response. A route that returns { ok: false } and a UI that
      // celebrates anyway is how the dashboard banner hid its own failures.
      if (r.ok && j?.ok) { setJustSent(true); setRing(null) }
      else alert("Couldn't tell the tablet — try again, or just go.")
    } catch {
      alert("Couldn't tell the tablet — try again, or just go.")
    }
    setSending(false)
  }

  if (!ring?.ringing || justSent) return null

  const mins = Math.floor(ring.waitedSec / 60)
  const waited = ring.waitedSec < 60 ? 'just now' : `${mins} min ago`

  return (
    <div style={{
      position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 9999,
      background: ring.goneQuiet ? '#5b1a1a' : '#151517',
      borderTop: `2px solid ${ring.goneQuiet ? '#ff6b6b' : CHAMP}`,
      padding: '14px 16px calc(14px + env(safe-area-inset-bottom))',
      display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
      boxShadow: '0 -10px 30px rgba(0,0,0,0.5)',
      fontFamily: 'Inter, sans-serif', color: '#fff',
    }}>
      <div style={{ flex: 1, minWidth: 190 }}>
        <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '0.02em' }}>
          🛎️ {ring.place || 'The kiosk'} needs someone
        </div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', marginTop: 3 }}>
          {ring.goneQuiet
            ? `Waiting ${waited} — they've been given the studio number`
            : `Tapped ${waited} · their tablet is waiting on you`}
        </div>
      </div>
      <button
        onClick={onMyWay}
        disabled={sending}
        style={{
          background: CHAMP, color: '#0b0b0d', border: 'none', borderRadius: 12,
          padding: '15px 26px', fontSize: 13, fontWeight: 800, letterSpacing: '0.14em',
          cursor: 'pointer', fontFamily: 'Inter, sans-serif', opacity: sending ? 0.6 : 1,
        }}
      >
        {sending ? 'SENDING…' : 'ON MY WAY'}
      </button>
    </div>
  )
}
