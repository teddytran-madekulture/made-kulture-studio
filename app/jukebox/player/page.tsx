'use client'

// Jukebox PLAYER — runs on a per-zone device (Fire tablet for YouTube zones, a
// laptop for Spotify zones), paired to that area's Bluetooth speaker. The server
// queue drives it: it plays the current approved request, asks the server to
// advance on song-end, falls back to the zone's house playlist when empty, and
// picks up skips / new approvals from the state poll.
//
// Two engines:
//   • YouTube — IFrame Player API. Works everywhere (incl. Fire tablets).
//   • Spotify — Web Playback SDK. DESKTOP ONLY (the SDK won't run in mobile
//     browsers), so a Spotify zone must run on the laptop. Requires the studio's
//     Spotify to be connected (Admin → Jukebox) and Premium.
//
// URL: /jukebox/player?zone=main-studio   (+ &key= if JUKEBOX_PLAYER_KEY is set;
// the key is REQUIRED for Spotify token minting when configured.)

import { useCallback, useEffect, useRef, useState } from 'react'

const GOLD = '#d4a843'
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

export default function PlayerPage() {
  const [started, setStarted] = useState(false)
  const [display, setDisplay] = useState<{ title: string; artist: string; source: 'request' | 'house' | 'idle' | 'paused' | 'blocked' }>({ title: '', artist: '', source: 'idle' })
  const [upNext, setUpNext] = useState(0)
  const [zoneName, setZoneName] = useState('')
  const [zoneSlug, setZoneSlug] = useState('')
  const [engine, setEngine] = useState<'youtube' | 'spotify' | null>(null)

  const zoneRef = useRef('')
  const keyRef = useRef<string | undefined>(undefined)

  // shared queue state
  const lastState = useRef<any>(null)
  const currentReqId = useRef<string | null>(null)
  const currentSource = useRef<'youtube' | 'spotify' | null>(null)
  const modeRef = useRef<'request' | 'house' | 'idle' | 'paused' | 'blocked'>('idle')
  const advancing = useRef(false)
  const houseKey = useRef<string | null>(null)
  const buildVer = useRef<string | null>(null)
  const needsReload = useRef(false)

  // youtube
  const yt = useRef<any>(null)
  const ytReady = useRef(false)
  const ytLoaded = useRef<string | null>(null)
  const shuffled = useRef(false)

  // spotify
  const sp = useRef<any>(null)
  const spDevice = useRef<string | null>(null)
  const spReady = useRef(false)
  const spTok = useRef<{ token: string; exp: number } | null>(null)
  const spWasPlaying = useRef(false)

  const pausedLocal = useRef(false)

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const z = (p.get('zone') || '').trim()
    zoneRef.current = z
    keyRef.current = p.get('key') || undefined
    setZoneSlug(z)
    document.body.style.zoom = '1'
  }, [])

  // ── Spotify token (short-lived, minted server-side from the stored refresh token) ──
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

  // While the house playlist is running, the player engine (not our server) owns
  // which track is on. Pull the live title/artist straight from it so the tablet
  // shows the actual song instead of a generic "House playlist" label.
  const refreshHouseNowPlaying = useCallback(() => {
    if (modeRef.current !== 'house') return
    if (currentSource.current === 'youtube') {
      try {
        const d = yt.current?.getVideoData?.()
        if (d?.title) setDisplay({ title: d.title, artist: d.author || '', source: 'house' })
      } catch {}
    }
    // (Spotify updates itself via the player_state_changed listener.)
  }, [])

  // ── YouTube engine ──
  useEffect(() => {
    if (!started) return
    const w = window as any
    const boot = () => {
      if (yt.current) return
      yt.current = new w.YT.Player('yt-player', {
        width: '100%', height: '100%',
        playerVars: { autoplay: 1, controls: 0, disablekb: 1, modestbranding: 1, rel: 0, fs: 0, playsinline: 1, iv_load_policy: 3 },
        events: {
          onReady: () => { ytReady.current = true; if (lastState.current) apply(lastState.current) },
          onStateChange: (e: any) => {
            const YT = (window as any).YT
            if (e.data === YT.PlayerState.PLAYING && modeRef.current === 'house' && currentSource.current === 'youtube') {
              if (!shuffled.current) {
                try { yt.current.setShuffle(true); yt.current.setLoop(true); shuffled.current = true; yt.current.nextVideo() } catch {}
              }
              refreshHouseNowPlaying()
            }
            if (e.data === YT.PlayerState.ENDED && currentSource.current === 'youtube') onSongEnd()
          },
          onError: () => {
            if (currentSource.current !== 'youtube') return
            // A restricted / unavailable video errors out. In the house playlist
            // YouTube won't auto-advance past it, so skip forward ourselves;
            // for a guest request, advance the server queue as on a normal end.
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
  }, [started])

  // Keep the house-playlist "now playing" label fresh — titles lag on load and
  // change as the playlist auto-advances.
  useEffect(() => {
    if (!started) return
    const iv = setInterval(refreshHouseNowPlaying, 4000)
    return () => clearInterval(iv)
  }, [started, refreshHouseNowPlaying])

  const ytPlay = (id: string) => { if (ytLoaded.current === id && modeRef.current === 'request') return; try { yt.current?.loadVideoById(id) } catch {}; ytLoaded.current = id; shuffled.current = false }
  const ytHouse = (pid: string) => { shuffled.current = false; ytLoaded.current = null; try { yt.current?.loadPlaylist({ list: pid, listType: 'playlist' }) } catch {} }
  const ytStop = () => { try { yt.current?.pauseVideo() } catch {} }
  const ytResume = () => { try { yt.current?.playVideo() } catch {} }

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
        // In house mode, show the real track from Spotify (parity with YouTube).
        if (modeRef.current === 'house') {
          const cur = st.track_window?.current_track
          if (cur?.name) setDisplay({ title: cur.name, artist: (cur.artists || []).map((a: any) => a.name).join(', '), source: 'house' })
        }
        // Natural end heuristic: was playing, now paused at position 0.
        if (spWasPlaying.current && st.paused && st.position === 0) { spWasPlaying.current = false; onSongEnd(); return }
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
  const spPlayTrack = (id: string) => { spWasPlaying.current = false; spApiPlay({ uris: [`spotify:track:${id}`] }) }
  const spHouse = (uri: string) => { spWasPlaying.current = false; spApiPlay({ context_uri: uri }) }
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

  const goHouse = (zone: any) => {
    houseKey.current = zone.house_playlist_url || null
    currentReqId.current = null
    setEngine(zone.source === 'spotify' ? 'spotify' : 'youtube')
    if (zone.source === 'spotify') {
      const uri = spotifyPlaylistUri(zone.house_playlist_url)
      currentSource.current = 'spotify'; ytStop()
      if (uri) { modeRef.current = 'house'; spHouse(uri); setDisplay({ title: 'House playlist', artist: '', source: 'house' }) }
      else { modeRef.current = 'idle'; setDisplay({ title: '', artist: '', source: 'idle' }) }
    } else {
      const pid = ytPlaylistId(zone.house_playlist_url)
      currentSource.current = 'youtube'; spStop()
      if (pid) { modeRef.current = 'house'; ytHouse(pid); setDisplay({ title: 'House playlist', artist: '', source: 'house' }) }
      else { modeRef.current = 'idle'; setDisplay({ title: '', artist: '', source: 'idle' }) }
    }
  }

  // ── Reconcile with server state ──
  const apply = useCallback(async (s: any) => {
    if (!s?.zone) return
    setZoneName(s.zone.name || ''); setUpNext(s.up_next?.length ?? 0)
    const wantsSpotify = s.zone.source === 'spotify' || s.now_playing?.source === 'spotify'

    if (wantsSpotify && !isDesktop()) { modeRef.current = 'blocked'; setDisplay({ title: 'Open this zone on the laptop', artist: 'Spotify playback needs a desktop browser', source: 'blocked' }); return }
    if (wantsSpotify && !spReady.current) return       // wait for SDK
    if (!wantsSpotify && !ytReady.current) return      // wait for IFrame

    // Pause when the jukebox is closed (is_open=false) OR admin hit Pause (paused=true).
    // Keep modeRef as-is so playback resumes into the same track & queue position.
    const wantPause = !s.zone.is_open || s.zone.paused
    if (wantPause) {
      if (!pausedLocal.current) { if (currentSource.current === 'spotify') spStop(); else ytStop(); pausedLocal.current = true }
      setDisplay(d => ({ title: d.title || (!s.zone.is_open ? 'Jukebox off' : 'Paused'), artist: d.artist, source: 'paused' }))
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
    if (needsReload.current) { window.location.reload(); return }
    // house / idle
    if (modeRef.current !== 'house' || houseKey.current !== (s.zone.house_playlist_url || null)) goHouse(s.zone)
  }, [advance])

  // poll
  useEffect(() => {
    if (!started || !zoneRef.current) return
    const tick = async () => {
      try {
        const r = await fetch(`/api/jukebox/state?zone=${encodeURIComponent(zoneRef.current)}`)
        if (!r.ok) return
        const s = await r.json(); lastState.current = s; apply(s)
      } catch {}
    }
    tick(); const iv = setInterval(tick, 5000); return () => clearInterval(iv)
  }, [started, apply])

  // self-update (only while idle/house, never mid-request-song)
  useEffect(() => {
    if (!started) return
    const check = async () => {
      try {
        const r = await fetch('/api/version', { cache: 'no-store' }); if (!r.ok) return
        const { version } = await r.json(); if (!version) return
        if (buildVer.current === null) { buildVer.current = version; return }
        if (version !== buildVer.current) {
          if (['house', 'idle', 'paused', 'blocked'].includes(modeRef.current)) window.location.reload()
          else needsReload.current = true
        }
      } catch {}
    }
    check(); const iv = setInterval(check, 120_000); return () => clearInterval(iv)
  }, [started])

  // keep screen awake where supported
  useEffect(() => {
    if (!started) return
    let lock: any = null
    const acquire = async () => { try { lock = await (navigator as any).wakeLock?.request('screen') } catch {} }
    acquire()
    const vis = () => { if (document.visibilityState === 'visible') acquire() }
    document.addEventListener('visibilitychange', vis)
    return () => { document.removeEventListener('visibilitychange', vis); try { lock?.release() } catch {} }
  }, [started])

  if (!started) return (
    <main style={{ background: '#000', color: '#fff', height: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontFamily: 'Inter, sans-serif', gap: 18, textAlign: 'center', padding: 24 }}>
      <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 40, letterSpacing: '0.05em' }}>STUDIO JUKEBOX</div>
      {zoneSlug
        ? <>
            <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15, maxWidth: 400, lineHeight: 1.6 }}>Player for this area. Pair this device to the Bluetooth speaker, then tap to start. (Spotify zones must run on the laptop.)</div>
            <button onClick={() => setStarted(true)} style={{ marginTop: 8, background: GOLD, color: '#000', border: 'none', borderRadius: 14, padding: '20px 54px', fontSize: 15, fontWeight: 800, letterSpacing: '0.16em', cursor: 'pointer' }}>TAP TO START</button>
          </>
        : <div style={{ color: '#f87171', fontSize: 15, maxWidth: 380 }}>Missing zone. Open as <code>/jukebox/player?zone=main-studio</code>.</div>}
    </main>
  )

  return (
    <main style={{ background: '#000', height: '100vh', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, sans-serif', overflow: 'hidden' }}>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        <div id="yt-player" style={{ position: 'absolute', inset: 0, display: engine === 'spotify' ? 'none' : 'block' }} />
        {engine !== 'spotify' && (
          // Audio-only cover: the YouTube player keeps playing underneath, but we
          // paint an opaque "now playing" card over it so the tablet shows the
          // song info instead of the music video.
          <div style={{ position: 'absolute', inset: 0, background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.9)' }}>
            <div style={{ textAlign: 'center', padding: 24 }}>
              <div style={{ color: display.source === 'paused' ? '#f87171' : GOLD, fontSize: 13, letterSpacing: '0.2em', marginBottom: 14 }}>
                {display.source === 'house' ? '♫ HOUSE PLAYLIST' : display.source === 'paused' ? '❚❚ PAUSED' : display.source === 'request' ? '♫ NOW PLAYING' : '♫ WAITING FOR REQUESTS'}
              </div>
              <div style={{ fontSize: 32, fontWeight: 800, maxWidth: '80vw', lineHeight: 1.2 }}>{display.title || '—'}</div>
              {display.artist && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 17, marginTop: 10 }}>{display.artist}</div>}
            </div>
          </div>
        )}
        {engine === 'spotify' && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.9)' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ color: '#1db954', fontSize: 13, letterSpacing: '0.2em', marginBottom: 14 }}>♫ SPOTIFY</div>
              <div style={{ fontSize: 30, fontWeight: 800, maxWidth: '80vw' }}>{display.title || '—'}</div>
              {display.artist && <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 16, marginTop: 8 }}>{display.artist}</div>}
            </div>
          </div>
        )}
      </div>
      <div style={{ flexShrink: 0, background: '#0a0a0a', borderTop: '1px solid rgba(255,255,255,0.08)', padding: '12px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 10, letterSpacing: '0.16em', color: display.source === 'paused' || display.source === 'blocked' ? '#f87171' : GOLD }}>
            {display.source === 'request' ? 'NOW PLAYING' : display.source === 'house' ? 'HOUSE PLAYLIST' : display.source === 'paused' ? 'PAUSED' : display.source === 'blocked' ? 'WRONG DEVICE' : 'WAITING FOR REQUESTS'}
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
