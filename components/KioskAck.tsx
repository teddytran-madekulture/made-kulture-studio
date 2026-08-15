'use client'

// The kiosk ring banner — "someone is standing at a tablet waiting for you" —
// plus the desktop audible alert.
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

import { useCallback, useEffect, useRef, useState } from 'react'

const POLL_MS      = 20_000
const SOUND_GAP_MS = 20_000
const CHAMP = '#c9b27e'

interface Ring { ringing: boolean; place: string; waitedSec: number; goneQuiet: boolean }

// ── Audible alert ────────────────────────────────────────────────────────────
// Chime first (synthesised, see below), then a recorded voice line naming the
// place. Three tiers, so this can degrade but never go silent:
//   1. /sounds/<slug>.wav   — the real voice, e.g. set-a.wav, front-door.wav
//   2. /sounds/kiosk.wav    — generic "The kiosk needs help" for a set with no
//                             file yet (add Set E and it says this, not nothing)
//   3. speechSynthesis      — if the files are missing entirely
//
// ⚠️ Browsers refuse to play audio until the user has interacted with the page,
// so this is armed on Teddy's first click anywhere in the admin. If he loads the
// admin and never touches it, the first ring is silent — the banner still
// appears, and the phone push is unaffected.

let audioCtx: AudioContext | null = null
let voiceEl: HTMLAudioElement | null = null

function unlockAudio() {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return
    if (!audioCtx) audioCtx = new Ctx()
    if (audioCtx.state === 'suspended') void audioCtx.resume()
  } catch { /* no audio on this device — banner and push still work */ }
}

// The chime is SYNTHESISED from an oscillator, not a file: nothing to ship for
// it, nothing to 404, and it cannot go missing in a deploy. Two notes, A5 then
// D6 — reads as a doorbell rather than an error tone.
function chime() {
  const ctx = audioCtx
  if (!ctx || ctx.state !== 'running') return
  const now = ctx.currentTime
  ;[880, 1174.7].forEach((freq, i) => {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.value = freq
    const t = now + i * 0.18
    gain.gain.setValueAtTime(0.0001, t)
    gain.gain.exponentialRampToValueAtTime(0.28, t + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.55)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start(t)
    osc.stop(t + 0.6)
  })
}

// "SET A" → "Set A". ⚠️ Only for the speech fallback: several engines spell
// all-caps words out letter by letter, so "SET A" comes out as "S-E-T-A".
function pretty(place: string): string {
  return place.trim().split(/\s+/)
    .map(w => (w.length > 1 ? w[0] + w.slice(1).toLowerCase() : w))
    .join(' ')
}

function speak(text: string) {
  try {
    const s = window.speechSynthesis
    if (!s) return
    s.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.rate = 0.95
    s.speak(u)
  } catch {}
}

// The server sends the place as "SET A" / "FRONT DOOR"; the files are named off
// the original slug. Lowercase + hyphenate is the exact inverse of placeLabel()
// in /api/kiosk/summon.
function slugOf(place: string): string {
  return place.trim().toLowerCase().replace(/\s+/g, '-')
}

function playClip(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const a = new Audio(src)
    voiceEl = a
    a.addEventListener('error', () => reject(new Error('load failed')), { once: true })
    // play() resolves when playback STARTS (not when it ends) and rejects on a
    // 404 or a blocked autoplay — either way we fall to the next tier.
    a.play().then(resolve, reject)
  })
}

async function announce(place: string) {
  const slug = slugOf(place) || 'kiosk'
  try { await playClip(`/sounds/${slug}.wav`); return } catch {}
  try { await playClip('/sounds/kiosk.wav'); return } catch {}
  speak(`${pretty(place) || 'The kiosk'} needs help`)
}

function hush() {
  try { window.speechSynthesis?.cancel() } catch {}
  try { voiceEl?.pause() } catch {}
}

export default function KioskAck() {
  const [ring, setRing] = useState<Ring | null>(null)
  const [sending, setSending] = useState(false)
  const [justSent, setJustSent] = useState(false)
  const lastSound = useRef(0)

  // Arm audio on the first real interaction, then stop listening.
  useEffect(() => {
    const go = () => { unlockAudio() }
    window.addEventListener('pointerdown', go, { once: true })
    window.addEventListener('keydown', go, { once: true })
    return () => {
      window.removeEventListener('pointerdown', go)
      window.removeEventListener('keydown', go)
    }
  }, [])

  const check = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/kiosk-ack', { cache: 'no-store' })
      if (!r.ok) return                      // 401 on the login page is expected
      const j: Ring = await r.json()
      setRing(j)
      if (!j.ringing) { setJustSent(false); return }   // cleared — arm for the next one

      // Re-alerts every ~20s until ON MY WAY. The route stops reporting `ringing`
      // after 6 minutes, so this goes quiet on its own rather than forever.
      const now = Date.now()
      if (now - lastSound.current >= SOUND_GAP_MS) {
        lastSound.current = now
        chime()
        // Let the bell finish before the voice starts.
        setTimeout(() => void announce(j.place || 'kiosk'), 750)
      }
    } catch { /* offline: keep the last known state rather than hiding the banner */ }
  }, [])

  useEffect(() => {
    // ⚠️ This polls even while the tab is HIDDEN, which is deliberate and is the
    // whole point of the sound — the scenario is Teddy in another app with the
    // admin behind it. One desktop at 20s is a fraction of what two jukebox
    // tablets at 5s cost (see the Vercel CPU note), but it is not free: do not
    // shorten this interval without a reason.
    check()
    const iv = setInterval(check, POLL_MS)
    const onVis = () => { if (document.visibilityState === 'visible') check() }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    return () => {
      clearInterval(iv)
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onVis)
    }
  }, [check])

  const onMyWay = async () => {
    if (sending) return
    setSending(true)
    hush()
    try {
      const r = await fetch('/api/admin/kiosk-ack', { method: 'POST', cache: 'no-store' })
      const j = await r.json().catch(() => ({}))
      // Read the response. A route that returns { ok: false } and a UI that
      // celebrates anyway is how the dashboard banner hid its own failures.
      if (r.ok && j?.ok) {
        setJustSent(true)
        setRing(null)
        lastSound.current = Date.now()   // don't let a stale poll re-chime
      } else {
        alert("Couldn't tell the tablet — try again, or just go.")
      }
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
