'use client'
// THE JUKEBOX PLAYER ENGINE (extracted 2026-10-05 from app/jukebox/player/page.tsx).
//
// Two hosts, one engine — so the queue logic can never drift between them:
//   • /jukebox/player?zone=…          — a dedicated music device (as before)
//   • /kiosk?set=…&jukebox=<zone>     — a set's kiosk tablet that ALSO plays the
//                                       studio music (Set D hosts main-studio).
//                                       Fully Kiosk can only show one page, so
//                                       the music has to live inside the kiosk
//                                       page or it stops when you leave it.
//
// The server queue drives it: plays the current approved request, asks the
// server to advance on song-end, falls back to the zone's house playlist when
// empty, and picks up skips / new approvals from the state poll.
//
// Engines: YouTube IFrame API (works on Fire tablets) and the Spotify Web
// Playback SDK (DESKTOP ONLY — a Spotify zone must run on the laptop).
//
// ⚠️ BUMP lib/player-rev.ts when you change this file — the dedicated music
// devices only reload when JUKEBOX_PLAYER_REV changes.
import { useCallback, useEffect, useRef, useState } from 'react'

export type JukeboxSource = 'request' | 'house' | 'idle' | 'paused' | 'blocked'
export type JukeboxDisplay = { title: string; artist: string; source: JukeboxSource }

const isDesktop = () => typeof navigator !== 'undefined' && !/Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)

function ytPlaylistId(url: string | null): string | null {
  if (!url) return null
  const m = /[?&]list=([A-Za-z0-9_-]+)/.exec(url)
  if (m) return m[1]
  const raw = url.trim(); return raw ? raw.split(/[?&/]/).pop() || raw : null
}
function spotifyPlaylistUri(url: string | null): string | null {
  if (!url) return null
  const m = /playlist[:/]([A-Za-z0-9]+)/.exec(url)
  if (m) return `spotify:playlist:${m[1]}`
  if (url.startsWith('spotify:')) return url
  return null
}

// ── How often the device talks to the server ─────────────────────────────────
// This used to be a flat 5 seconds, forever — two tablets × every 5s × 24h was
// two thirds of the project's compute budget and blew the hosting CPU cap
// (see vercel-cpu-jukebox-polling). The poll now matches what's happening.
const POLL_ACTIVE_MS = 5_000    // a request is playing or queued
const POLL_HOUSE_MS  = 15_000   // house music, studio open
const POLL_IDLE_MS   = 60_000   // closed, paused, or outside studio hours

// Outside 9am–10pm Central nobody can request, so only a slow heartbeat — but
// it must NEVER stop (after-hours buyouts are real bookings).
function withinStudioHours(): boolean {
  try {
    const h = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', hour12: false }).format(new Date()))
    return h >= 9 && h < 22
  } catch { return true }
}
function pollDelayFor(s: any): number {
  if (!s?.zone) return POLL_HOUSE_MS
  if (!s.zone.is_open || s.zone.paused) return POLL_IDLE_MS
  if (s.now_playing || (s.up_next?.length ?? 0) > 0) return POLL_ACTIVE_MS
  return withinStudioHours() ? POLL_HOUSE_MS : POLL_IDLE_MS
}

const VOL_KEY = 'mk-jukebox-vol'

export function useJukeboxPlayer(opts: {
  zone: string
  playerKey?: string
  started: boolean
  /** id of the element the YouTube iframe mounts into */
  ytElementId: string
  /** Dedicated devices watch /api/version themselves. The kiosk has its own
   *  version check and calls requestUpdate() instead. */
  selfUpdate: boolean
  /** Extra gate on reloading (the kiosk only reloads while on HOME). */
  canReload?: () => boolean
}) {
  const { zone, playerKey, started, ytElementId, selfUpdate } = opts
  const canReloadRef = useRef(opts.canReload)
  canReloadRef.current = opts.canReload

  const [display, setDisplay] = useState<JukeboxDisplay>({ title: '', artist: '', source: 'idle' })
  const [upNext, setUpNext] = useState(0)
  const [snapshot, setSnapshot] = useState<any>(null)
  const [zoneName, setZoneName] = useState('')
  const [engine, setEngine] = useState<'youtube' | 'spotify' | null>(null)
  const [needsTap, setNeedsTap] = useState(false)

  const zoneRef = useRef(zone); zoneRef.current = zone
  const keyRef = useRef(playerKey); keyRef.current = playerKey

  const lastState = useRef<any>(null)
  const currentReqId = useRef<string | null>(null)
  const currentSource = useRef<'youtube' | 'spotify' | null>(null)
  const modeRef = useRef<JukeboxSource>('idle')
  const advancing = useRef(false)
  const houseKey = useRef<string | null>(null)
  const buildVer = useRef<string | null>(null)
  const reloadStamp = useRef<string | null>(null)
  const needsReload = useRef(false)

  const yt = useRef<any>(null)
  const ytReady = useRef(false)
  const ytLoaded = useRef<string | null>(null)
  const shuffled = useRef(false)

  const sp = useRef<any>(null)
  const spDevice = useRef<string | null>(null)
  const spReady = useRef(false)
  const spTok = useRef<{ token: string; exp: number } | null>(null)
  const spWasPlaying = useRef(false)
  const spHouseTuned = useRef(false)

  const pausedLocal = useRef(false)

  // ── Self-update safety ──
  // Is sound coming out of the speaker right now? House music counts.
  const audiblyPlaying = (): boolean => {
    if (pausedLocal.current) return false
    const m = modeRef.current
    if (m === 'idle' || m === 'paused' || m === 'blocked') return false
    if (currentSource.current === 'youtube') {
      try {
        const YT = (window as any).YT
        const st = yt.current?.getPlayerState?.()
        return st === YT?.PlayerState?.PLAYING || st === YT?.PlayerState?.BUFFERING
      } catch { return true }
    }
    return true
  }
  const hostAllowsReload = () => { try { return canReloadRef.current ? canReloadRef.current() : true } catch { return true } }
  // Take a pending update only in a silent moment. Returns true if it reloaded.
  const reloadIfQuiet = (): boolean => {
    if (!needsReload.current || audiblyPlaying() || !hostAllowsReload()) return false
    window.location.reload()
    return true
  }
  // At a natural seam (a house track just ended) — reload if the host allows.
  const reloadAtSeam = (): boolean => {
    if (!needsReload.current || !hostAllowsReload()) return false
    window.location.reload()
    return true
  }

  const spotifyToken = useCallback(async (): Promise<string | null> => {
    if (spTok.current && spTok.current.exp > Date.now() + 30_000) return spTok.current.token
    try {
      const u = new URL('/api/spotify/token', window.location.origin)
      if (keyRef.current) u.searchParams.set('key', keyRef.current)
      const r = await fetch(u.toString(), { cache: 'no-store' })
      if (!r.ok) return null
      const d = await r.json()
      spTok.current = { token: d.access_token, exp: Date.now() + 50 * 60_000 }
      return d.access_token
    } catch { return null }
  }, [])

  const advance = useCallback(async (endedId: string | null) => {
    try {
      const r = await fetch('/api/jukebox/advance', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone: zoneRef.current, endedId, key: keyRef.current }),
      })
      return r.ok ? await r.json() : null
    } catch { return null }
  }, [])

  // Report the real house track (deduped, ~15s heartbeat) for the admin console
  // and the guest page. HOUSE_FRESH_MS in /api/jukebox/state is 45s.
  const lastHouseSig = useRef('')
  const lastHousePost = useRef(0)
  const reportHouse = useCallback((title: string, artist: string) => {
    if (!title) return
    const sig = `${title}|${artist}`
    const now = Date.now()
    if (sig === lastHouseSig.current && now - lastHousePost.current < 15000) return
    lastHouseSig.current = sig; lastHousePost.current = now
    try {
      fetch('/api/jukebox/house-now', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ zone: zoneRef.current, key: keyRef.current, title, artist }),
      }).catch(() => {})
    } catch {}
  }, [])

  const refreshHouseNowPlaying = useCallback(() => {
    if (modeRef.current !== 'house' || pausedLocal.current) return
    if (currentSource.current === 'youtube') {
      try {
        const d = yt.current?.getVideoData?.()
        if (d?.title) { setDisplay({ title: d.title, artist: d.author || '', source: 'house' }); reportHouse(d.title, d.author || '') }
      } catch {}
    } else if (currentSource.current === 'spotify') {
      try {
        sp.current?.getCurrentState?.().then((st: any) => {
          const cur = st?.track_window?.current_track
          if (cur?.name) {
            const a = (cur.artists || []).map((x: any) => x.name).join(', ')
            setDisplay({ title: cur.name, artist: a, source: 'house' }); reportHouse(cur.name, a)
          }
        }).catch(() => {})
      } catch {}
    }
  }, [reportHouse])

  const applyVolume = () => {
    try { const v = Number(localStorage.getItem(VOL_KEY)); if (v >= 0 && v <= 100 && localStorage.getItem(VOL_KEY) !== null) yt.current?.setVolume?.(v) } catch {}
  }

  // ── YouTube engine ──
  useEffect(() => {
    if (!started) return
    const w = window as any
    const boot = () => {
      if (yt.current || !document.getElementById(ytElementId)) return
      yt.current = new w.YT.Player(ytElementId, {
        width: '100%', height: '100%',
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, modestbranding: 1, rel: 0, fs: 0, playsinline: 1, iv_load_policy: 3 },
        events: {
          onReady: () => { ytReady.current = true; applyVolume(); if (lastState.current) apply(lastState.current) },
          onStateChange: (e: any) => {
            const YT = (window as any).YT
            // 2026-10-07: Android WebView (Fully Kiosk) lets YouTube autoplay
            // only MUTED — it reports PLAYING while the room is silent, which
            // cleared the "tap to start" prompt with no sound (Set D, 10/07).
            // Muted-but-playing still needs a tap; the tap unmutes (nudge).
            if (e.data === YT.PlayerState.PLAYING) {
              let muted = false
              try { muted = !!yt.current?.isMuted?.() } catch {}
              setNeedsTap(muted)
            }
            if (e.data === YT.PlayerState.PLAYING && modeRef.current === 'house' && currentSource.current === 'youtube') {
              if (!shuffled.current) {
                try { yt.current.setShuffle(true); yt.current.setLoop(true); shuffled.current = true; yt.current.nextVideo() } catch {}
              }
              refreshHouseNowPlaying()
            }
            if (e.data === YT.PlayerState.ENDED && currentSource.current === 'youtube') {
              // A house track just finished — the natural seam to take a pending
              // update. Never mid-run of a guest request (it would replay).
              if (modeRef.current === 'house' && reloadAtSeam()) return
              onSongEnd()
            }
          },
          onError: () => {
            if (currentSource.current !== 'youtube') return
            if (modeRef.current === 'house') { try { yt.current?.nextVideo() } catch {} }
            else onSongEnd()
          },
        },
      })
    }
    if (w.YT && w.YT.Player) boot()
    else {
      const prev = w.onYouTubeIframeAPIReady
      w.onYouTubeIframeAPIReady = () => { prev?.(); boot() }
      if (!document.getElementById('yt-iframe-api')) {
        const s = document.createElement('script'); s.id = 'yt-iframe-api'; s.src = 'https://www.youtube.com/iframe_api'; document.body.appendChild(s)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, ytElementId])

  // Autoplay can be blocked until someone touches the screen. If the player has
  // been told to play but is still unstarted/cued after a few seconds, say so.
  useEffect(() => {
    if (!started) return
    const iv = setInterval(() => {
      const m = modeRef.current
      if (pausedLocal.current || (m !== 'house' && m !== 'request') || currentSource.current !== 'youtube') { setNeedsTap(false); return }
      try {
        const st = yt.current?.getPlayerState?.()
        setNeedsTap(st === -1 || st === 5)
      } catch {}
    }, 8_000)
    return () => clearInterval(iv)
  }, [started])

  // Keep the house "now playing" label fresh (20s < HOUSE_FRESH_MS 45s).
  useEffect(() => {
    if (!started) return
    const iv = setInterval(() => {
      if (modeRef.current !== 'house' || pausedLocal.current) return
      refreshHouseNowPlaying()
    }, 20_000)
    return () => clearInterval(iv)
  }, [started, refreshHouseNowPlaying])

  const ytPlay = (id: string) => { if (ytLoaded.current === id && modeRef.current === 'request') return; try { yt.current?.loadVideoById(id) } catch {}; ytLoaded.current = id; shuffled.current = false }
  const ytHouse = (pid: string) => { shuffled.current = false; ytLoaded.current = null; try { yt.current?.loadPlaylist({ list: pid, listType: 'playlist' }) } catch {} }
  const ytStop = () => { try { yt.current?.pauseVideo() } catch {} }
  const ytResume = () => {
    try { yt.current?.unMute?.() } catch {}
    try { yt.current?.playVideo() } catch {}
    // Re-apply the saved volume (unMute alone keeps it) and re-check after the tap.
    setTimeout(() => { try { if (yt.current?.isMuted?.()) setNeedsTap(true); else setNeedsTap(false) } catch {} }, 1200)
  }

  // ── Spotify engine ──
  useEffect(() => {
    if (!started || !isDesktop()) return
    const w = window as any
    const boot = () => {
      if (sp.current) return
      sp.current = new w.Spotify.Player({
        name: `Made Kulture — ${zoneRef.current}`,
        getOAuthToken: (cb: (t: string) => void) => { spotifyToken().then(t => { if (t) cb(t) }) },
        volume: 0.8,
      })
      sp.current.addListener('ready', ({ device_id }: any) => { spDevice.current = device_id; spReady.current = true; try { sp.current.activateElement() } catch {}; if (lastState.current) apply(lastState.current) })
      sp.current.addListener('not_ready', () => { spReady.current = false })
      sp.current.addListener('player_state_changed', (st: any) => {
        if (!st || currentSource.current !== 'spotify' || pausedLocal.current) return
        if (modeRef.current === 'house') {
          const cur = st.track_window?.current_track
          if (cur?.name) {
            const a = (cur.artists || []).map((x: any) => x.name).join(', ')
            setDisplay({ title: cur.name, artist: a, source: 'house' }); reportHouse(cur.name, a)
          }
          // Shuffle + repeat the house context once it's live, or it plays in
          // order and then stops dead.
          if (!st.paused && !spHouseTuned.current) {
            spHouseTuned.current = true
            ;(async () => { await spSetMode('shuffle', 'true'); await spSetMode('repeat', 'context'); await spSkip() })()
          }
        }
        // Natural end heuristic: was playing, now paused at position 0.
        if (spWasPlaying.current && st.paused && st.position === 0) {
          spWasPlaying.current = false
          if (modeRef.current === 'house' && reloadAtSeam()) return
          onSongEnd(); return
        }
        if (!st.paused) spWasPlaying.current = true
      })
      sp.current.connect()
    }
    if (w.Spotify) boot()
    else {
      const prev = w.onSpotifyWebPlaybackSDKReady
      w.onSpotifyWebPlaybackSDKReady = () => { prev?.(); boot() }
      if (!document.getElementById('sp-sdk')) {
        const s = document.createElement('script'); s.id = 'sp-sdk'; s.src = 'https://sdk.scdn.co/spotify-player.js'; document.body.appendChild(s)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, spotifyToken])

  const spApiPlay = async (body: any) => {
    const token = await spotifyToken(); const device = spDevice.current
    if (!token || !device) return
    try {
      await fetch(`https://api.spotify.com/v1/me/player/play?device_id=${device}`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
    } catch {}
  }
  const spSetMode = async (endpoint: 'shuffle' | 'repeat', state: string) => {
    const token = await spotifyToken(); const device = spDevice.current
    if (!token || !device) return
    try {
      await fetch(`https://api.spotify.com/v1/me/player/${endpoint}?state=${encodeURIComponent(state)}&device_id=${device}`, {
        method: 'PUT', headers: { Authorization: `Bearer ${token}` },
      })
    } catch {}
  }
  const spSkip = async () => {
    const token = await spotifyToken(); const device = spDevice.current
    if (!token || !device) return
    try {
      await fetch(`https://api.spotify.com/v1/me/player/next?device_id=${device}`, { method: 'POST', headers: { Authorization: `Bearer ${token}` } })
    } catch {}
  }
  const spPlayTrack = (id: string) => {
    spWasPlaying.current = false
    spHouseTuned.current = false
    ;(async () => {
      await spApiPlay({ uris: [`spotify:track:${id}`] })
      // Repeat MUST be off for a guest request or the queue wedges on one song.
      await spSetMode('repeat', 'off')
    })()
  }
  const spHouse = (uri: string) => { spWasPlaying.current = false; spHouseTuned.current = false; spApiPlay({ context_uri: uri }) }
  const spStop = () => { try { sp.current?.pause() } catch {} }
  const spResume = () => { try { sp.current?.resume() } catch {} }

  // ── Song end → advance ──
  const onSongEnd = useCallback(async () => {
    if (modeRef.current !== 'request' || advancing.current) return
    advancing.current = true
    const res = await advance(currentReqId.current)
    advancing.current = false
    const np = res?.now_playing
    if (np) startTrack(np)
    else if (lastState.current?.zone?.house_playlist_url) goHouse(lastState.current.zone)
    else { modeRef.current = 'idle'; currentReqId.current = null; setDisplay({ title: '', artist: '', source: 'idle' }) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advance])

  const startTrack = (np: any) => {
    pausedLocal.current = false
    currentReqId.current = np.id
    currentSource.current = (np.source === 'spotify' ? 'spotify' : 'youtube')
    setEngine(currentSource.current)
    modeRef.current = 'request'
    if (currentSource.current === 'spotify') { ytStop(); spPlayTrack(np.external_id) }
    else { spStop(); ytPlay(np.external_id) }
    setDisplay({ title: np.title, artist: np.artist || '', source: 'request' })
  }

  const goHouse = (z: any) => {
    houseKey.current = z.house_playlist_url || null
    currentReqId.current = null
    setEngine(z.source === 'spotify' ? 'spotify' : 'youtube')
    if (z.source === 'spotify') {
      const uri = spotifyPlaylistUri(z.house_playlist_url)
      currentSource.current = 'spotify'; ytStop()
      if (uri) { modeRef.current = 'house'; spHouse(uri); setDisplay({ title: 'House playlist', artist: '', source: 'house' }) }
      else { modeRef.current = 'idle'; setDisplay({ title: '', artist: '', source: 'idle' }) }
    } else {
      const pid = ytPlaylistId(z.house_playlist_url)
      currentSource.current = 'youtube'; spStop()
      if (pid) { modeRef.current = 'house'; ytHouse(pid); setDisplay({ title: 'House playlist', artist: '', source: 'house' }) }
      else { modeRef.current = 'idle'; setDisplay({ title: '', artist: '', source: 'idle' }) }
    }
  }

  // ── Reconcile with server state ──
  const apply = useCallback(async (s: any) => {
    if (!s?.zone) return
    setZoneName(s.zone.name || ''); setUpNext(s.up_next?.length ?? 0); setSnapshot(s)
    const wantsSpotify = s.zone.source === 'spotify' || s.now_playing?.source === 'spotify'

    if (wantsSpotify && !isDesktop()) { modeRef.current = 'blocked'; setDisplay({ title: 'Open this zone on the laptop', artist: 'Spotify playback needs a desktop browser', source: 'blocked' }); return }
    if (wantsSpotify && !spReady.current) return
    if (!wantsSpotify && !ytReady.current) return

    // Pause when the jukebox is closed OR admin hit Pause. Keep modeRef so it
    // resumes into the same track & queue position.
    const wantPause = !s.zone.is_open || s.zone.paused
    if (wantPause) {
      if (!pausedLocal.current) { if (currentSource.current === 'spotify') spStop(); else ytStop(); pausedLocal.current = true }
      setDisplay(d => ({ title: d.title || (!s.zone.is_open ? 'Jukebox off' : 'Paused'), artist: d.artist, source: 'paused' }))
      reloadIfQuiet()
      return
    }
    if (pausedLocal.current) {
      pausedLocal.current = false
      if (currentSource.current === 'spotify') spResume(); else ytResume()
      if (s.now_playing) setDisplay({ title: s.now_playing.title, artist: s.now_playing.artist || '', source: 'request' })
      else if (modeRef.current === 'house') setDisplay({ title: 'House playlist', artist: '', source: 'house' })
    }
    if (modeRef.current === 'blocked') modeRef.current = 'idle'

    const np = s.now_playing
    if (np) { if (currentReqId.current !== np.id) startTrack(np); return }

    if ((s.up_next?.length ?? 0) > 0 && !advancing.current) {
      advancing.current = true
      const res = await advance(null); advancing.current = false
      if (res?.now_playing) { startTrack(res.now_playing); return }
    }
    if (reloadIfQuiet()) return
    if (modeRef.current !== 'house' || houseKey.current !== (s.zone.house_playlist_url || null)) goHouse(s.zone)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [advance])

  // poll — self-rescheduling at a rate that matches the room.
  const pollNow = useRef<() => void>(() => {})
  useEffect(() => {
    if (!started || !zone) return
    let stopped = false
    let timer: ReturnType<typeof setTimeout> | null = null
    const tick = async () => {
      if (timer) { clearTimeout(timer); timer = null }
      let delay = POLL_HOUSE_MS
      try {
        const r = await fetch(`/api/jukebox/state?zone=${encodeURIComponent(zoneRef.current)}`)
        if (r.ok) { const s = await r.json(); lastState.current = s; apply(s); delay = pollDelayFor(s) }
      } catch {}
      if (!stopped) timer = setTimeout(tick, delay)
    }
    pollNow.current = () => { if (!stopped) tick() }
    tick()
    return () => { stopped = true; if (timer) clearTimeout(timer) }
  }, [started, zone, apply])

  // Self-update for dedicated devices (player_rev + "Update players now").
  useEffect(() => {
    if (!started || !selfUpdate) return
    const check = async () => {
      try {
        const r = await fetch('/api/version', { cache: 'no-store' }); if (!r.ok) return
        const { player_rev, reload_at } = await r.json()
        if (reload_at !== undefined) {
          if (reloadStamp.current === null) reloadStamp.current = reload_at ?? ''
          else if ((reload_at ?? '') !== reloadStamp.current) { window.location.reload(); return }
        }
        if (!player_rev) return
        if (buildVer.current === null) { buildVer.current = player_rev; return }
        if (player_rev !== buildVer.current) { needsReload.current = true; reloadIfQuiet() }
      } catch {}
    }
    // Every 2 min: only exists to notice a deploy or "Update players now".
    check(); const iv = setInterval(check, 120_000); return () => clearInterval(iv)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started, selfUpdate])

  // ── Controls for a host UI (the kiosk MUSIC panel) ──
  /** Queue an update; it lands at the next silent moment / house-track seam. */
  const requestUpdate = useCallback(() => { needsReload.current = true; reloadIfQuiet() }, [])
  /** Skip within the house playlist (a guest request is skipped server-side). */
  const skipHouseTrack = useCallback(() => {
    if (modeRef.current !== 'house') return
    if (currentSource.current === 'spotify') spSkip(); else { try { yt.current?.nextVideo() } catch {} }
    setTimeout(refreshHouseNowPlaying, 1500)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshHouseNowPlaying])
  const setVolume = useCallback((v: number) => {
    const n = Math.max(0, Math.min(100, Math.round(v)))
    try { localStorage.setItem(VOL_KEY, String(n)) } catch {}
    try { yt.current?.setVolume?.(n) } catch {}
    try { sp.current?.setVolume?.(n / 100) } catch {}
  }, [])
  const getVolume = useCallback((): number => {
    try { const v = yt.current?.getVolume?.(); if (typeof v === 'number') return v } catch {}
    try { const s = localStorage.getItem(VOL_KEY); if (s !== null) return Number(s) } catch {}
    return 100
  }, [])
  /** Retry playback after a touch (autoplay was blocked). */
  const nudge = useCallback(() => {
    if (pausedLocal.current) return
    if (currentSource.current === 'youtube') ytResume()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const refresh = useCallback(() => pollNow.current(), [])

  return { display, upNext, snapshot, zoneName, engine, needsTap, requestUpdate, skipHouseTrack, setVolume, getVolume, nudge, refresh }
}
