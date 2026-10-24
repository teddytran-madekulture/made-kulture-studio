'use client'
// /kiosk/host — the MUSIC LAYER of a set tablet that also plays studio music
// (2026-10-24). See lib/kiosk-music-bridge.ts for the why.
//
// Renders an invisible YouTube player plus a full-screen <iframe> of the normal
// kiosk. The kiosk reloads itself on every deploy; this page does not, so the
// music keeps playing through updates. It reloads only when:
//   • JUKEBOX_PLAYER_REV changes (lib/player-rev.ts), at a silent moment / the
//     end of a house track, and only while the kiosk is on HOME; or
//   • Admin → Jukebox "Update players now" is pressed (immediately).
//
// ⚠️ BUMP lib/player-rev.ts when you change this file, or the tablet keeps
// running the old copy until its next power cycle.
// ⚠️ After any load of THIS page the music starts MUTED (Android WebView rule)
// until someone taps. If that lasts during studio hours the owner gets a push
// (/api/kiosk/music-alert) instead of the room sitting silent unnoticed.
import { useEffect, useRef, useState } from 'react'
import { useJukeboxPlayer } from '@/components/jukebox/useJukeboxPlayer'
import { MUSIC_HOST_GLOBAL, type MusicHostApi } from '@/lib/kiosk-music-bridge'

const SLUG_RE = /^[a-z0-9-]{2,40}$/
const MUTED_ALERT_AFTER_MS = 90_000

function withinStudioHours(): boolean {
  try {
    const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }).format(new Date()))
    return h >= 9 && h < 22
  } catch { return true }
}

export default function KioskMusicHost() {
  const [cfg, setCfg] = useState<{ set: string; key?: string; zone: string; src: string } | null>(null)

  useEffect(() => {
    const q = new URLSearchParams(window.location.search)
    const set = (q.get('set') || '').trim()
    const zone = (q.get('jukebox') || '').trim()
    // Nothing to host → this is just a kiosk.
    if (!SLUG_RE.test(set) || !SLUG_RE.test(zone)) { window.location.replace('/kiosk' + window.location.search); return }
    setCfg({ set, zone, key: q.get('key') || undefined, src: '/kiosk' + window.location.search })
  }, [])

  const kioskScreen = useRef('home')
  const music = useJukeboxPlayer({
    zone: cfg?.zone || '', playerKey: cfg?.key, started: !!cfg,
    ytElementId: 'host-yt', selfUpdate: true,
    canReload: () => kioskScreen.current === 'home',
  })

  // ── The bridge the kiosk iframe talks to ──
  const musicRef = useRef(music); musicRef.current = music
  const subs = useRef(new Set<() => void>())
  useEffect(() => {
    const api: MusicHostApi = {
      getState: () => ({ display: musicRef.current.display, snapshot: musicRef.current.snapshot, zoneName: musicRef.current.zoneName, needsTap: musicRef.current.needsTap }),
      subscribe: (cb) => { subs.current.add(cb); return () => { subs.current.delete(cb) } },
      skipHouseTrack: () => musicRef.current.skipHouseTrack(),
      setVolume: (v) => musicRef.current.setVolume(v),
      getVolume: () => musicRef.current.getVolume(),
      nudge: () => musicRef.current.nudge(),
      refresh: () => musicRef.current.refresh(),
      setKioskScreen: (s) => { kioskScreen.current = String(s || 'home') },
    }
    ;(window as any)[MUSIC_HOST_GLOBAL] = api
    return () => { try { delete (window as any)[MUSIC_HOST_GLOBAL] } catch {} }
  }, [])
  useEffect(() => {
    for (const cb of Array.from(subs.current)) {
      // A kiosk that reloaded leaves a callback from a dead page behind.
      try { cb() } catch { subs.current.delete(cb) }
    }
  }, [music.display, music.snapshot, music.zoneName, music.needsTap])

  // A tap on the host itself (only possible if the iframe failed) also starts it.
  useEffect(() => {
    if (!music.needsTap) return
    const go = () => music.nudge()
    document.addEventListener('pointerdown', go, { once: true })
    return () => document.removeEventListener('pointerdown', go)
  }, [music.needsTap, music.nudge])

  // ── "The music is silent" push ──
  const tapSince = useRef<number | null>(null)
  const alerted = useRef(false)
  const live = useRef({ needsTap: false, snapshot: null as any })
  live.current = { needsTap: music.needsTap, snapshot: music.snapshot }
  useEffect(() => {
    if (!music.needsTap) { tapSince.current = null; alerted.current = false }
    else if (tapSince.current === null) tapSince.current = Date.now()
  }, [music.needsTap])
  useEffect(() => {
    if (!cfg) return
    const iv = setInterval(() => {
      const { needsTap, snapshot } = live.current
      if (!needsTap || alerted.current || tapSince.current === null) return
      if (Date.now() - tapSince.current < MUTED_ALERT_AFTER_MS) return
      if (!withinStudioHours()) return
      const z = snapshot?.zone
      if (z && (!z.is_open || z.paused)) return
      alerted.current = true
      fetch('/api/kiosk/music-alert', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key: cfg.key, set: cfg.set, zone: cfg.zone }),
      }).catch(() => { alerted.current = false })
    }, 30_000)
    return () => clearInterval(iv)
  }, [cfg])

  // Keep the screen awake (Fully does this too; harmless where unsupported).
  useEffect(() => {
    if (!cfg) return
    let lock: any = null
    const acquire = async () => { try { lock = await (navigator as any).wakeLock?.request('screen') } catch {} }
    acquire()
    const vis = () => { if (document.visibilityState === 'visible') acquire() }
    document.addEventListener('visibilitychange', vis)
    return () => { document.removeEventListener('visibilitychange', vis); try { lock?.release() } catch {} }
  }, [cfg])

  return (
    <main style={{ position: 'fixed', inset: 0, background: '#0b0b0c', overflow: 'hidden' }}>
      {/* The player: rendered, tiny, invisible, behind the kiosk. */}
      <div aria-hidden="true" style={{ position: 'fixed', left: 0, bottom: 0, width: 200, height: 200, opacity: 0.001, pointerEvents: 'none', zIndex: 0, overflow: 'hidden' }}>
        <div id="host-yt" />
      </div>
      {cfg && (
        <iframe
          src={cfg.src}
          title="Kiosk"
          allow="autoplay; microphone; camera; fullscreen; clipboard-write"
          style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', border: 0, zIndex: 1, background: '#0b0b0c' }}
        />
      )}
    </main>
  )
}
