'use client'

// Loud in-app alarm for kiosk "Get the team" rings. Mounted on every /admin page
// (via admin/layout). Polls /api/admin/kiosk-alert; when a NEW, recent ring comes
// in, it takes over the screen and loops a siren until Teddy acknowledges.
//
// Only fires while the admin app is open/foreground — that's the intended scope.
// Web Audio needs a user gesture to unlock, so we unlock on the first interaction.

import { useCallback, useEffect, useRef, useState } from 'react'

const POLL_MS = 5000
const RECENT_MS = 3 * 60 * 1000   // ignore rings older than 3 min (e.g. on first load)
const MAX_SOUND_MS = 90 * 1000    // stop the noise after 90s even if not dismissed

export default function KioskAlarm() {
  const [alarming, setAlarming] = useState(false)
  const [flash, setFlash] = useState(false)
  const lastSeen = useRef<string | null>(null)
  const initialized = useRef(false)
  const ctxRef = useRef<AudioContext | null>(null)
  const sirenTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const flashTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const ensureCtx = useCallback(() => {
    if (!ctxRef.current) {
      const AC = (window.AudioContext || (window as any).webkitAudioContext)
      if (AC) ctxRef.current = new AC()
    }
    if (ctxRef.current?.state === 'suspended') ctxRef.current.resume().catch(() => {})
    return ctxRef.current
  }, [])

  // Unlock audio on the first interaction anywhere in the admin app.
  useEffect(() => {
    const unlock = () => ensureCtx()
    window.addEventListener('pointerdown', unlock, { once: true })
    window.addEventListener('keydown', unlock, { once: true })
    return () => {
      window.removeEventListener('pointerdown', unlock)
      window.removeEventListener('keydown', unlock)
    }
  }, [ensureCtx])

  const beep = useCallback((freq: number, at: number, dur: number) => {
    const ctx = ctxRef.current
    if (!ctx) return
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = 'square'
    o.frequency.value = freq
    g.gain.setValueAtTime(0.0001, at)
    g.gain.exponentialRampToValueAtTime(0.55, at + 0.02)
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur)
    o.connect(g); g.connect(ctx.destination)
    o.start(at); o.stop(at + dur + 0.03)
  }, [])

  const stopAlarm = useCallback(() => {
    setAlarming(false)
    setFlash(false)
    if (sirenTimer.current) { clearInterval(sirenTimer.current); sirenTimer.current = null }
    if (flashTimer.current) { clearInterval(flashTimer.current); flashTimer.current = null }
    if (stopTimer.current) { clearTimeout(stopTimer.current); stopTimer.current = null }
  }, [])

  const stopSoundOnly = useCallback(() => {
    if (sirenTimer.current) { clearInterval(sirenTimer.current); sirenTimer.current = null }
  }, [])

  const startAlarm = useCallback(() => {
    setAlarming(true)
    const ctx = ensureCtx()
    // Siren: alternating two-tone every ~700ms.
    if (ctx && !sirenTimer.current) {
      let hi = true
      const fire = () => {
        const t = ctx.currentTime
        beep(hi ? 880 : 620, t, 0.32)
        hi = !hi
      }
      fire()
      sirenTimer.current = setInterval(fire, 700)
    }
    // Visual flash.
    if (!flashTimer.current) {
      flashTimer.current = setInterval(() => setFlash(f => !f), 500)
    }
    // Cap the noise so it doesn't blare forever if he's away; overlay stays until dismissed.
    stopTimer.current = setTimeout(stopSoundOnly, MAX_SOUND_MS)
  }, [beep, ensureCtx, stopSoundOnly])

  // Poll for new rings.
  useEffect(() => {
    let active = true
    const tick = async () => {
      try {
        const r = await fetch('/api/admin/kiosk-alert', { cache: 'no-store' })
        if (!r.ok) return
        const d = await r.json()
        const at: string | null = d?.at ?? null
        if (!active) return
        if (!initialized.current) {
          // Don't alarm for a ring that predates this page load.
          lastSeen.current = at
          initialized.current = true
          return
        }
        if (at && at !== lastSeen.current) {
          lastSeen.current = at
          const age = Date.now() - new Date(at).getTime()
          if (age >= 0 && age < RECENT_MS) startAlarm()
        }
      } catch {}
    }
    const iv = setInterval(tick, POLL_MS)
    tick()
    return () => { active = false; clearInterval(iv) }
  }, [startAlarm])

  useEffect(() => () => stopAlarm(), [stopAlarm])

  if (!alarming) return null

  return (
    <div
      role="alertdialog"
      aria-label="Someone is at the kiosk"
      style={{
        position: 'fixed', inset: 0, zIndex: 2147483647,
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 28, padding: 24, textAlign: 'center',
        background: flash ? '#c0392b' : '#080808',
        transition: 'background 120ms',
        fontFamily: 'Inter, sans-serif', color: '#fff',
      }}
    >
      <div style={{ fontSize: 64, lineHeight: 1 }}>🛎️</div>
      <div style={{ fontSize: 30, fontWeight: 800, letterSpacing: '0.06em' }}>SOMEONE&apos;S AT THE KIOSK</div>
      <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.8)', maxWidth: 420 }}>
        A guest at the front tapped &ldquo;Get the team&rdquo; and is waiting up front.
      </div>
      <button
        onClick={stopAlarm}
        style={{
          marginTop: 8, background: '#fff', color: '#080808', border: 'none',
          padding: '18px 40px', borderRadius: 12, fontSize: 16, fontWeight: 800,
          letterSpacing: '0.14em', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
        }}
      >
        I&apos;VE GOT IT
      </button>
      <a
        href="/admin/inbox"
        onClick={stopAlarm}
        style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', textDecoration: 'underline' }}
      >
        Open inbox
      </a>
    </div>
  )
}
