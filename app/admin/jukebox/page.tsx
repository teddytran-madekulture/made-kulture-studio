'use client'

// Admin jukebox console — one tab per zone. Approve/reject incoming requests,
// see & skip what's playing, manage the up-next queue, and set each zone's house
// playlist + on/off. Auto-refreshes so new requests appear without a reload.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'

const C = { bg: '#0b0b0d', card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#d4a843' }

interface Zone { id: string; slug: string; name: string; source: string; is_open: boolean; paused: boolean; explicit_filter: boolean; auto_approve: boolean; house_playlist_url: string | null }
interface Req { id: string; external_id: string; title: string; artist: string | null; thumbnail_url: string | null; duration_sec: number | null; requester_name: string | null; status: string }

function fmtDur(s: number | null): string { if (s == null) return ''; const m = Math.floor(s / 60); return `${m}:${String(s % 60).padStart(2, '0')}` }

export default function AdminJukeboxPage() {
  const [zones, setZones] = useState<Zone[]>([])
  const [slug, setSlug] = useState('')
  const [zone, setZone] = useState<Zone | null>(null)
  const [pending, setPending] = useState<Req[]>([])
  const [upNext, setUpNext] = useState<Req[]>([])
  const [nowPlaying, setNowPlaying] = useState<Req | null>(null)
  const [played, setPlayed] = useState<Req[]>([])
  const [spotify, setSpotify] = useState<{ configured: boolean; connected: boolean; email?: string | null }>({ configured: false, connected: false })
  const [loading, setLoading] = useState(true)
  const [unauth, setUnauth] = useState(false)
  const [playlist, setPlaylist] = useState('')
  const [savedMsg, setSavedMsg] = useState('')
  const slugRef = useRef('')

  const load = useCallback(async (s?: string) => {
    const target = s ?? slugRef.current
    const r = await fetch(`/api/admin/jukebox${target ? `?zone=${encodeURIComponent(target)}` : ''}`)
    if (r.status === 401) { setUnauth(true); setLoading(false); return }
    const d = await r.json()
    setZones(d.zones ?? [])
    if (d.zone) {
      setZone(d.zone); slugRef.current = d.zone.slug; setSlug(d.zone.slug)
      setPlaylist(prev => (document.activeElement?.id === 'house-input' ? prev : (d.zone.house_playlist_url ?? '')))
    }
    setPending(d.pending ?? []); setUpNext(d.up_next ?? []); setNowPlaying(d.now_playing ?? null); setPlayed(d.played ?? [])
    setSpotify(d.spotify ?? { configured: false, connected: false })
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])
  // Live refresh.
  useEffect(() => { const iv = setInterval(() => load(), 5000); return () => clearInterval(iv) }, [load])

  const act = async (id: string, action: string) => {
    await fetch(`/api/admin/jukebox/${id}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
    load()
  }
  const control = async (action: string) => {
    await fetch('/api/admin/jukebox/control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ zone: slugRef.current, action }) })
    load()
  }
  const saveSettings = async (patch: Record<string, any>) => {
    await fetch('/api/admin/jukebox/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ zone: slugRef.current, ...patch }) })
    setSavedMsg('Saved'); setTimeout(() => setSavedMsg(''), 1500); load()
  }

  const tab = (active: boolean): React.CSSProperties => ({ padding: '9px 16px', borderRadius: 8, cursor: 'pointer', fontSize: 13, fontWeight: 600, border: active ? `1px solid ${C.accent}` : `1px solid ${C.line}`, background: active ? 'rgba(212,168,67,0.14)' : 'transparent', color: active ? C.accent : C.dim })
  const btn = (bg: string, fg: string): React.CSSProperties => ({ background: bg, color: fg, border: 'none', borderRadius: 7, padding: '8px 14px', fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', cursor: 'pointer' })
  const inp: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.line}`, color: C.text, fontFamily: 'Inter, sans-serif', fontSize: 13, padding: '9px 11px', outline: 'none', borderRadius: 6, width: '100%', boxSizing: 'border-box' }

  const Row = ({ t, children }: { t: Req; children: React.ReactNode }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 10 }}>
      {t.thumbnail_url && <img src={t.thumbnail_url} alt="" style={{ width: 46, height: 46, borderRadius: 6, objectFit: 'cover', flexShrink: 0 }} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</div>
        <div style={{ fontSize: 12, color: C.dim }}>{t.artist}{t.duration_sec ? ` · ${fmtDur(t.duration_sec)}` : ''}{t.requester_name ? ` · ${t.requester_name}` : ''}</div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>{children}</div>
    </div>
  )

  return (
    <main style={{ background: C.bg, minHeight: '100vh', color: C.text, padding: '40px 24px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: 0 }}>JUKEBOX</h1>
          <Link href="/admin/dashboard" style={{ color: C.dim, fontSize: 13, textDecoration: 'none' }}>← Admin</Link>
        </div>
        <p style={{ color: C.dim, fontSize: 13, marginTop: 0, marginBottom: 18 }}>Guests request songs from their phones; you approve or skip. Each area has its own queue + player tablet.</p>

        {unauth ? (
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 24 }}>Not signed in. <Link href="/admin" style={{ color: C.accent }}>Go to admin login →</Link></div>
        ) : loading ? <div style={{ color: C.dim }}>Loading…</div> : (
          <>
            {/* Zone tabs */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 18, flexWrap: 'wrap' }}>
              {zones.map(z => <button key={z.slug} style={tab(z.slug === slug)} onClick={() => { setSlug(z.slug); slugRef.current = z.slug; load(z.slug) }}>{z.name}{!z.is_open ? ' · paused' : ''}</button>)}
            </div>

            {zone && (
              <>
                {/* Settings bar */}
                <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 16, marginBottom: 22 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                    <button onClick={() => saveSettings({ is_open: !zone.is_open })} style={btn(zone.is_open ? '#1f6f43' : '#333', '#fff')}>
                      {zone.is_open ? '● Music ON' : '○ Music OFF'}
                    </button>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: C.dim, cursor: 'pointer' }}>
                      <input type="checkbox" checked={zone.explicit_filter} onChange={e => saveSettings({ explicit_filter: e.target.checked })} /> Filter explicit titles
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: zone.auto_approve ? C.accent : C.dim, cursor: 'pointer' }} title="Requests skip approval and go straight into the queue">
                      <input type="checkbox" checked={zone.auto_approve} onChange={e => saveSettings({ auto_approve: e.target.checked })} /> Auto-approve requests
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: C.dim }}>
                      Source
                      <select value={zone.source} onChange={e => saveSettings({ source: e.target.value })} style={{ ...inp, width: 'auto', padding: '6px 8px', fontWeight: 600, color: zone.source === 'spotify' ? '#1db954' : C.accent }}>
                        <option value="youtube" style={{ color: '#111' }}>YouTube</option>
                        <option value="spotify" style={{ color: '#111' }}>Spotify</option>
                      </select>
                    </label>
                    <div style={{ marginLeft: 'auto', display: 'flex', gap: 14, fontSize: 12 }}>
                      <a href={`/jukebox/player?zone=${zone.slug}`} target="_blank" rel="noreferrer" style={{ color: C.accent, textDecoration: 'none' }}>Open player ↗</a>
                      <a href={`/jukebox?zone=${zone.slug}`} target="_blank" rel="noreferrer" style={{ color: C.dim, textDecoration: 'none' }}>Guest page ↗</a>
                    </div>
                  </div>
                  {/* Spotify connect (only when this zone is on Spotify) */}
                  {zone.source === 'spotify' && (
                    <div style={{ marginTop: 14, padding: '11px 13px', borderRadius: 8, background: 'rgba(29,185,84,0.08)', border: '1px solid rgba(29,185,84,0.3)', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <span style={{ fontSize: 13, color: spotify.connected ? '#6ee7a8' : '#ffd27a' }}>
                        {spotify.connected ? `Spotify connected${spotify.email ? ` · ${spotify.email}` : ''}` : 'Spotify not connected yet'}
                      </span>
                      <div style={{ marginLeft: 'auto', display: 'flex', gap: 10 }}>
                        <a href="/api/spotify/auth" style={{ ...btn('#1db954', '#04160b'), textDecoration: 'none' }}>{spotify.connected ? 'Reconnect' : 'Connect Spotify'}</a>
                        {spotify.connected && (
                          <button onClick={async () => { await fetch('/api/spotify/status', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'disconnect' }) }); load() }} style={btn('transparent', C.dim)}>Disconnect</button>
                        )}
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 11, color: C.dim, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 5 }}>
                      House playlist ({zone.source === 'spotify' ? 'Spotify' : 'YouTube'}) — plays when the queue is empty
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input id="house-input" style={inp} value={playlist} onChange={e => setPlaylist(e.target.value)} placeholder={zone.source === 'spotify' ? 'https://open.spotify.com/playlist/…' : 'https://www.youtube.com/playlist?list=…'} />
                      <button onClick={() => saveSettings({ house_playlist_url: playlist })} style={btn(C.accent, '#0b0b0d')}>SAVE</button>
                    </div>
                    {savedMsg && <span style={{ color: '#6ee7a8', fontSize: 12 }}>{savedMsg}</span>}
                  </div>
                </div>

                {/* Now playing + transport */}
                <div style={{ marginBottom: 22 }}>
                  <div style={{ fontSize: 11, letterSpacing: '0.14em', color: C.dim, marginBottom: 8 }}>
                    NOW PLAYING {zone.paused && <span style={{ color: C.accent }}>· PAUSED</span>}
                  </div>
                  {nowPlaying ? (
                    <Row t={nowPlaying}>{null}</Row>
                  ) : <div style={{ color: C.dim, fontSize: 13 }}>{zone.house_playlist_url ? 'House playlist' : 'Nothing playing'}</div>}
                  {/* Transport controls */}
                  <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
                    <button onClick={() => control('previous')} title="Previous" style={{ ...btn('rgba(255,255,255,0.06)', C.text), border: `1px solid ${C.line}`, padding: '11px 18px', fontSize: 15 }}>⏮</button>
                    <button onClick={() => control(zone.paused ? 'play' : 'pause')} style={{ ...btn(C.accent, '#0b0b0d'), padding: '11px 24px', fontSize: 15 }}>{zone.paused ? '▶ Play' : '⏸ Pause'}</button>
                    <button onClick={() => control('next')} title="Next" style={{ ...btn('rgba(255,255,255,0.06)', C.text), border: `1px solid ${C.line}`, padding: '11px 18px', fontSize: 15 }}>⏭</button>
                  </div>
                </div>

                {/* Pending approvals */}
                <div style={{ marginBottom: 22 }}>
                  <div style={{ fontSize: 11, letterSpacing: '0.14em', color: C.dim, marginBottom: 8 }}>PENDING {pending.length > 0 && <span style={{ color: C.accent }}>({pending.length})</span>}</div>
                  {pending.length === 0 ? <div style={{ color: C.dim, fontSize: 13 }}>No requests waiting.</div> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {pending.map(t => (
                        <Row key={t.id} t={t}>
                          <button onClick={() => act(t.id, 'approve')} style={btn('#1f6f43', '#fff')}>APPROVE</button>
                          <button onClick={() => act(t.id, 'reject')} style={btn('transparent', C.dim)}>✕</button>
                        </Row>
                      ))}
                    </div>
                  )}
                </div>

                {/* Up next */}
                <div style={{ marginBottom: 22 }}>
                  <div style={{ fontSize: 11, letterSpacing: '0.14em', color: C.dim, marginBottom: 8 }}>UP NEXT {upNext.length > 0 && `(${upNext.length})`}</div>
                  {upNext.length === 0 ? <div style={{ color: C.dim, fontSize: 13 }}>Queue is empty.</div> : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {upNext.map(t => <Row key={t.id} t={t}><button onClick={() => act(t.id, 'remove')} style={btn('transparent', C.dim)}>✕</button></Row>)}
                    </div>
                  )}
                </div>

                {/* Recently played */}
                {played.length > 0 && (
                  <div>
                    <div style={{ fontSize: 11, letterSpacing: '0.14em', color: C.dim, marginBottom: 8 }}>RECENTLY PLAYED</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {played.map(t => (
                        <div key={t.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: C.dim, padding: '4px 2px' }}>
                          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}{t.artist ? ` — ${t.artist}` : ''}</span>
                          <span style={{ flexShrink: 0, color: t.status === 'skipped' ? '#ff9a9a' : 'rgba(255,255,255,0.3)' }}>{t.status}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </main>
  )
}
