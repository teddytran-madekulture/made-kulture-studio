'use client'

// Jukebox PLAYER — runs on the per-zone Fire tablet (fullscreen kiosk browser,
// signed into YouTube Premium so embeds are ad-free), paired to that area's
// Bluetooth speaker. URL: /jukebox/player?zone=main-studio  (+ &key= if
// JUKEBOX_PLAYER_KEY is set). It owns nothing — the server queue drives it:
//   • plays the current approved request; on end, asks the server to advance
//   • falls back to the zone's house playlist (shuffled) when the queue is empty
//   • picks up skips / newly-approved songs from the state poll
//   • reloads itself after a deploy, but only while idle on the house playlist

import { useCallback, useEffect, useRef, useState } from 'react'

const GOLD = '#d4a843'

function playlistId(url: string | null): string | null {
  if (!url) return null
  const m = /[?&]list=([A-Za-z0-9_-]+)/.exec(url)
  if (m) return m[1]
  const raw = url.trim()
  return raw ? raw.split(/[?&/]/).pop() || raw : null
}

export default function PlayerPage() {
  const [started, setStarted] = useState(false)
  const [display, setDisplay] = useState<{ title: string; artist: string; source: 'request' | 'house' | 'idle' | 'paused' }>({ title: '', artist: '', source: 'idle' })
  const [upNext, setUpNext] = useState(0)
  const [zoneName, setZoneName] = useState('')
  const [needKey, setNeedKey] = useState(false)

  const zoneRef = useRef('')
  const keyRef = useRef<string | undefined>(undefined)
  const playerRef = useRef<any>(null)
  const readyRef = useRef(false)
  const lastState = useRef<any>(null)
  const currentReqId = useRef<string | null>(null)   // request id currently loaded
  const loadedVideo = useRef<string | null>(null)
  const modeRef = useRef<'request' | 'house' | 'idle' | 'paused'>('idle')
  const houseUrl = useRef<string | null>(null)
  const shuffled = useRef(false)
  const advancing = useRef(false)
  const buildVer = useRef<string | null>(null)
  const needsReload = useRef(false)

  // Read query params once.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    zoneRef.current = (p.get('zone') || '').trim()
    keyRef.current = p.get('key') || undefined
    if (!zoneRef.current) setNeedKey(true) // reuse the "setup" screen for a missing zone too
    document.body.style.zoom = '1'
  }, [])

  // ── YouTube IFrame API ──
  useEffect(() => {
    if (!started) return
    const w = window as any
    const boot = () => {
      if (playerRef.current) return
      playerRef.current = new w.YT.Player('yt-player', {
        width: '100%', height: '100%',
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, modestbranding: 1, rel: 0, fs: 0, playsinline: 1, iv_load_policy: 3 },
        events: {
          onReady: () => { readyRef.current = true; if (lastState.current) apply(lastState.current) },
          onStateChange: (e: any) => {
            const YT = (window as any).YT
            if (e.data === YT.PlayerState.PLAYING && modeRef.current === 'house' && !shuffled.current) {
              try { playerRef.current.setShuffle(true); playerRef.current.setLoop(true); shuffled.current = true; playerRef.current.nextVideo() } catch {}
            }
            if (e.data === YT.PlayerState.ENDED) onEnded()
          },
          onError: () => onEnded(), // not embeddable / removed → move on
        },
      })
    }
    if (w.YT && w.YT.Player) boot()
    else {
      const prev = w.onYouTubeIframeAPIReady
      w.onYouTubeIframeAPIReady = () => { prev?.(); boot() }
      if (!document.getElementById('yt-iframe-api')) {
        const s = document.createElement('script')
        s.id = 'yt-iframe-api'; s.src = 'https://www.youtube.com/iframe_api'
        document.body.appendChild(s)
      }
    }
  }, [started])

  const loadVideo = (id: string) => {
    if (loadedVideo.current === id && modeRef.current === 'request') return
    try { playerRef.current?.loadVideoById(id) } catch {}
    loadedVideo.current = id
    shuffled.current = false
  }

  const ensureHouse = (url: string | null) => {
    const pid = playlistId(url)
    if (!pid) { modeRef.current = 'idle'; setDisplay({ title: '', artist: '', source: 'idle' }); return }
    if (modeRef.current === 'house' && houseUrl.current === url) return
    houseUrl.current = url
    modeRef.current = 'house'
    shuffled.current = false
    loadedVideo.current = null
    currentReqId.current = null
    try { playerRef.current?.loadPlaylist({ list: pid, listType: 'playlist' }) } catch {}
    setDisplay({ title: 'House playlist', artist: '', source: 'house' })
  }

  const advance = useCallback(async (endedId: string | null) => {
    try {
      const r = await fetch('/api/jukebox/advance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone: zoneRef.current, endedId, key: keyRef.current }),
      })
      if (!r.ok) return null
      return await r.json()
    } catch { return null }
  }, [])

  const onEnded = useCallback(async () => {
    if (modeRef.current !== 'request') return       // house playlist rolls on its own
    if (advancing.current) return
    advancing.current = true
    const res = await advance(currentReqId.current)
    advancing.current = false
    const np = res?.now_playing
    if (np) { currentReqId.current = np.id; modeRef.current = 'request'; loadVideo(np.external_id); setDisplay({ title: np.title, artist: np.artist || '', source: 'request' }) }
    else if (lastState.current?.zone?.house_playlist_url) ensureHouse(lastState.current.zone.house_playlist_url)
    else { modeRef.current = 'idle'; setDisplay({ title: '', artist: '', source: 'idle' }) }
  }, [advance])

  // ── Reconcile local playback with server state ──
  const apply = useCallback(async (s: any) => {
    if (!readyRef.current || !s?.zone) return
    setZoneName(s.zone.name || '')
    setUpNext((s.up_next?.length ?? 0))

    if (!s.zone.is_open) {
      modeRef.current = 'paused'
      try { playerRef.current?.pauseVideo() } catch {}
      setDisplay({ title: 'Jukebox paused', artist: '', source: 'paused' })
      return
    }
    if (modeRef.current === 'paused') { modeRef.current = 'idle'; try { playerRef.current?.playVideo() } catch {} }

    const np = s.now_playing
    if (np) {
      if (currentReqId.current !== np.id || loadedVideo.current !== np.external_id) {
        currentReqId.current = np.id; modeRef.current = 'request'
        loadVideo(np.external_id)
        setDisplay({ title: np.title, artist: np.artist || '', source: 'request' })
      }
      return
    }

    // now_playing is null → promote a pending-approved song, else house/idle.
    if ((s.up_next?.length ?? 0) > 0 && !advancing.current) {
      advancing.current = true
      const res = await advance(null)
      advancing.current = false
      const nn = res?.now_playing
      if (nn) { currentReqId.current = nn.id; modeRef.current = 'request'; loadVideo(nn.external_id); setDisplay({ title: nn.title, artist: nn.artist || '', source: 'request' }); return }
    }

    if (needsReload.current) { window.location.reload(); return }
    if (s.zone.house_playlist_url) ensureHouse(s.zone.house_playlist_url)
    else { currentReqId.current = null; modeRef.current = 'idle'; setDisplay({ title: '', artist: '', source: 'idle' }) }
  }, [advance])

  // Poll state every 5s.
  useEffect(() => {
    if (!started || !zoneRef.current) return
    const tick = async () => {
      try {
        const r = await fetch(`/api/jukebox/state?zone=${encodeURIComponent(zoneRef.current)}`)
        if (!r.ok) return
        const s = await r.json()
        lastState.current = s
        apply(s)
      } catch {}
    }
    tick()
    const iv = setInterval(tick, 5000)
    return () => clearInterval(iv)
  }, [started, apply])

  // Self-update: reload after a new deploy, but only while idle on the house
  // playlist (never mid-request-song). Flag it and let apply() flush it.
  useEffect(() => {
    if (!started) return
    const check = async () => {
      try {
        const r = await fetch('/api/version', { cache: 'no-store' })
        if (!r.ok) return
        const { version } = await r.json()
        if (!version) return
        if (buildVer.current === null) { buildVer.current = version; return }
        if (version !== buildVer.current) {
          if (modeRef.current === 'house' || modeRef.current === 'idle' || modeRef.current === 'paused') window.location.reload()
          else needsReload.current = true
        }
      } catch {}
    }
    check()
    const iv = setInterval(check, 120_000)
    return () => clearInterval(iv)
  }, [started])

  // Keep the screen awake where supported (Fully Kiosk also has its own setting).
  useEffect(() => {
    if (!started) return
    let lock: any = null
    const acquire = async () => { try { lock = await (navigator as any).wakeLock?.request('screen') } catch {} }
    acquire()
    const vis = () => { if (document.visibilityState === 'visible') acquire() }
    document.addEventListener('visibilitychange', vis)
    return () => { document.removeEventListener('visibilitychange', vis); try { lock?.release() } catch {} }
  }, [started])

  // ── Start overlay (satisfies autoplay-with-sound gesture) ──
  if (!started) return (
    <main style={{ background: '#000', color: '#fff', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', gap: 18, textAlign: 'center', padding: 24 }}>
      <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 40, letterSpacing: '0.05em' }}>STUDIO JUKEBOX</div>
      {zoneRef.current
        ? <>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15, maxWidth: 380, lineHeight: 1.6 }}>Player for this area. Make sure this tablet is paired to the Bluetooth speaker, then tap to start the music.</div>
            <button onClick={() => setStarted(true)} style={{ marginTop: 8, background: GOLD, color: '#000', border: 'none', borderRadius: 14, padding: '20px 54px', fontSize: 15, fontWeight: 800, letterSpacing: '0.16em', cursor: 'pointer' }}>TAP TO START</button>
          </>
        : <div style={{ color: '#f87171', fontSize: 15, maxWidth: 380 }}>Missing zone. Open this page as <code>/jukebox/player?zone=main-studio</code>.</div>}
    </main>
  )

  return (
    <main style={{ background: '#000', height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, sans-serif', overflow: 'hidden' }}>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <div id="yt-player" style={{ position: 'absolute', inset: 0 }} />
      </div>
      <div style={{ flexShrink: 0, background: '#0a0a0a', borderTop: '1px solid rgba(255,255,255,0.08)', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.16em', color: display.source === 'paused' ? '#f87171' : GOLD }}>
            {display.source === 'request' ? 'NOW PLAYING' : display.source === 'house' ? 'HOUSE PLAYLIST' : display.source === 'paused' ? 'PAUSED' : 'WAITING FOR REQUESTS'}
            <span style={{ color: 'rgba(255,255,255,0.3)', marginLeft: 10 }}>{zoneName}</span>
          </div>
          <div style={{ color: '#fff', fontSize: 16, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '70vw' }}>{display.title || '—'}</div>
          {display.artist && <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13 }}>{display.artist}</div>}
        </div>
        <div style={{ flexShrink: 0, color: 'rgba(255,255,255,0.4)', fontSize: 13, textAlign: 'right' }}>{upNext > 0 ? `${upNext} up next` : ''}</div>
      </div>
    </main>
  )
}
