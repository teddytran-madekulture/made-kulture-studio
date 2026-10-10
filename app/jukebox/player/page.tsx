'use client'

// Jukebox PLAYER — a dedicated per-zone device (Fire tablet for YouTube zones, a
// laptop for Spotify zones), paired to that area's Bluetooth speaker.
// The engine (queue, house playlist, self-update) lives in
// components/jukebox/useJukeboxPlayer — shared with the Set D kiosk tablet,
// which plays the main studio music inside the kiosk page.
//
// URL: /jukebox/player?zone=main-studio   (+ &key= if JUKEBOX_PLAYER_KEY is set;
// the key is REQUIRED for Spotify token minting when configured.)

import { useEffect, useState } from 'react'
import { useJukeboxPlayer } from '@/components/jukebox/useJukeboxPlayer'

const GOLD = '#d4a843'

export default function PlayerPage() {
  const [started, setStarted] = useState(false)
  const [zoneSlug, setZoneSlug] = useState('')
  const [playerKey, setPlayerKey] = useState<string | undefined>(undefined)

  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    setZoneSlug((p.get('zone') || '').trim())
    setPlayerKey(p.get('key') || undefined)
    document.body.style.zoom = '1'
  }, [])

  const { display, upNext, zoneName, engine } = useJukeboxPlayer({
    zone: zoneSlug, playerKey, started, ytElementId: 'yt-player', selfUpdate: true,
  })

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
                {display.source === 'house' ? '♫ HOUSE PLAYLIST' : display.source === 'vibe' ? '♫ KEEPING THE VIBE GOING' : display.source === 'paused' ? '❚❚ PAUSED' : display.source === 'request' ? '♫ NOW PLAYING' : '♫ WAITING FOR REQUESTS'}
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
            {display.source === 'request' ? 'NOW PLAYING' : display.source === 'house' ? 'HOUSE PLAYLIST' : display.source === 'vibe' ? 'KEEPING THE VIBE GOING' : display.source === 'paused' ? 'PAUSED' : display.source === 'blocked' ? 'WRONG DEVICE' : 'WAITING FOR REQUESTS'}
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
