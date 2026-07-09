'use client'

// Guest-facing jukebox request page (QR target: /jukebox?zone=main-studio).
// Anyone can search + request a song; nothing plays until the team approves it.

import { useCallback, useEffect, useRef, useState } from 'react'

const GOLD = '#d4a843'
const BG = '#080808'

interface Zone { slug: string; name: string; is_open: boolean }
interface Result { source: string; external_id: string; title: string; artist: string; thumbnail: string | null; duration: number | null }
interface Track { id: string; external_id: string; title: string; artist: string | null; thumbnail_url: string | null; duration_sec: number | null; requester_name?: string | null; status?: string }

function fmtDur(s: number | null | undefined): string {
  if (!s && s !== 0) return ''
  const m = Math.floor(s / 60), sec = s % 60
  return `${m}:${String(sec).padStart(2, '0')}`
}
function deviceId(): string {
  try {
    let id = localStorage.getItem('mk_jukebox_device')
    if (!id) { id = (crypto.randomUUID?.() || String(Math.random()).slice(2) + Date.now()); localStorage.setItem('mk_jukebox_device', id) }
    return id
  } catch { return 'anon' }
}
function decode(s: string): string {
  // YouTube titles arrive HTML-escaped (&amp; &#39; …).
  if (typeof document === 'undefined') return s
  const el = document.createElement('textarea'); el.innerHTML = s; return el.value
}

export default function JukeboxClient({ initialZone }: { initialZone: string }) {
  const [zoneSlug, setZoneSlug] = useState(initialZone)
  const [zones, setZones] = useState<Zone[] | null>(null)
  const [state, setState] = useState<any>(null)
  const [q, setQ] = useState('')
  const [results, setResults] = useState<Result[] | null>(null)
  const [searching, setSearching] = useState(false)
  const [submitting, setSubmitting] = useState('')
  const [toast, setToast] = useState('')
  const [err, setErr] = useState('')
  const device = useRef('anon')

  useEffect(() => { device.current = deviceId() }, [])

  // Zone picker when opened without a ?zone=.
  useEffect(() => {
    if (zoneSlug) return
    fetch('/api/jukebox/zones').then(r => r.json()).then(d => setZones(d.zones ?? [])).catch(() => setZones([]))
  }, [zoneSlug])

  const loadState = useCallback(async () => {
    if (!zoneSlug) return
    try {
      const r = await fetch(`/api/jukebox/state?zone=${encodeURIComponent(zoneSlug)}&device=${encodeURIComponent(device.current)}`)
      if (r.ok) setState(await r.json())
    } catch {}
  }, [zoneSlug])

  useEffect(() => {
    if (!zoneSlug) return
    loadState()
    const iv = setInterval(loadState, 6000)
    return () => clearInterval(iv)
  }, [zoneSlug, loadState])

  const search = async () => {
    const term = q.trim()
    if (!term) return
    setSearching(true); setErr(''); setResults(null)
    try {
      const r = await fetch(`/api/jukebox/search?q=${encodeURIComponent(term)}&zone=${encodeURIComponent(zoneSlug)}`)
      const d = await r.json()
      if (!r.ok) setErr(d.error || 'Search is unavailable right now.')
      setResults(d.results ?? [])
    } catch { setErr('Search failed — try again.') }
    setSearching(false)
  }

  const request = async (t: Result) => {
    setSubmitting(t.external_id); setErr('')
    try {
      const r = await fetch('/api/jukebox/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          zone: zoneSlug, source: t.source, external_id: t.external_id,
          title: decode(t.title), artist: t.artist, thumbnail: t.thumbnail,
          duration: t.duration, device: device.current,
        }),
      })
      const d = await r.json()
      if (r.ok) { setToast(d.message || 'Added!'); setResults(null); setQ(''); loadState(); setTimeout(() => setToast(''), 4000) }
      else setErr(d.error || 'Could not add that song.')
    } catch { setErr('Connection problem — try again.') }
    setSubmitting('')
  }

  // ── Styles ──
  const wrap: React.CSSProperties = { background: BG, minHeight: '100vh', color: '#fff', fontFamily: 'Inter, sans-serif', padding: '28px 18px 60px' }
  const card: React.CSSProperties = { background: '#141416', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, padding: 14 }
  const input: React.CSSProperties = { flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 16, padding: '13px 14px', outline: 'none', borderRadius: 10 }

  // Zone picker
  if (!zoneSlug) return (
    <main style={wrap}>
      <div style={{ maxWidth: 460, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, margin: '4px 0 6px', letterSpacing: '0.04em' }}>STUDIO JUKEBOX</h1>
        <p style={{ color: 'rgba(255,255,255,0.5)', fontSize: 14, marginBottom: 22 }}>Which area are you in?</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {(zones ?? []).map(z => (
            <button key={z.slug} onClick={() => setZoneSlug(z.slug)} style={{ ...card, textAlign: 'left', cursor: 'pointer', color: '#fff', fontSize: 17, fontWeight: 600 }}>
              {z.name}
            </button>
          ))}
          {zones && zones.length === 0 && <div style={{ color: 'rgba(255,255,255,0.4)' }}>No areas set up yet.</div>}
        </div>
      </div>
    </main>
  )

  const zone: Zone | undefined = state?.zone
  const closed = zone && !zone.is_open
  const nowPlaying: Track | null = state?.now_playing ?? null
  const upNext: Track[] = state?.up_next ?? []
  const mine: any[] = state?.mine ?? []

  return (
    <main style={wrap}>
      <div style={{ maxWidth: 520, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 30, margin: '2px 0 2px', letterSpacing: '0.04em' }}>STUDIO JUKEBOX</h1>
          <span style={{ fontSize: 12, color: GOLD, letterSpacing: '0.08em' }}>{zone?.name ?? ''}</span>
        </div>
        <p style={{ color: 'rgba(255,255,255,0.45)', fontSize: 13, margin: '0 0 18px' }}>
          Search a song and send it to the queue — the team approves requests so the vibe stays right for everyone.
        </p>

        {toast && <div style={{ background: 'rgba(212,168,67,0.14)', border: `1px solid ${GOLD}`, color: GOLD, borderRadius: 10, padding: '11px 14px', fontSize: 14, marginBottom: 14 }}>{toast}</div>}

        {closed ? (
          <div style={{ ...card, textAlign: 'center', color: 'rgba(255,255,255,0.6)' }}>🎧 The jukebox is paused right now.</div>
        ) : (
          <>
            {/* Search */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 6 }}>
              <input style={input} value={q} onChange={e => setQ(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') search() }} placeholder="Search a song or artist…" maxLength={120} />
              <button onClick={search} disabled={searching || !q.trim()} style={{ background: GOLD, color: '#080808', border: 'none', borderRadius: 10, padding: '0 20px', fontWeight: 800, fontSize: 13, letterSpacing: '0.08em', cursor: 'pointer' }}>
                {searching ? '…' : 'FIND'}
              </button>
            </div>
            {err && <div style={{ color: '#f87171', fontSize: 13, margin: '8px 0' }}>{err}</div>}

            {/* Results */}
            {results && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '12px 0 8px' }}>
                {results.length === 0 && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No results — try different words.</div>}
                {results.map(t => (
                  <button key={t.external_id} onClick={() => request(t)} disabled={!!submitting} style={{ ...card, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', cursor: 'pointer', color: '#fff', padding: 10 }}>
                    {t.thumbnail && <img src={t.thumbnail} alt="" style={{ width: 54, height: 54, objectFit: 'cover', borderRadius: 8, flexShrink: 0 }} />}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{decode(t.title)}</div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{t.artist}{t.duration ? ` · ${fmtDur(t.duration)}` : ''}</div>
                    </div>
                    <span style={{ color: GOLD, fontSize: 22, flexShrink: 0 }}>{submitting === t.external_id ? '…' : '+'}</span>
                  </button>
                ))}
              </div>
            )}

            {/* Your requests */}
            {mine.length > 0 && (
              <div style={{ marginTop: 20 }}>
                <div style={{ fontSize: 11, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>YOUR REQUESTS</div>
                {mine.map(m => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, padding: '9px 12px', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, marginBottom: 6, fontSize: 13 }}>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.title}</span>
                    <span style={{ flexShrink: 0, color: m.status === 'playing' ? GOLD : m.status === 'approved' ? '#6ee7a8' : 'rgba(255,255,255,0.4)' }}>
                      {m.status === 'playing' ? 'Now playing' : m.status === 'approved' ? 'Up next ✓' : 'Waiting…'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* Now playing + up next */}
        <div style={{ marginTop: 26 }}>
          <div style={{ fontSize: 11, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.4)', marginBottom: 10 }}>NOW PLAYING</div>
          {nowPlaying ? (
            <div style={{ ...card, display: 'flex', alignItems: 'center', gap: 12 }}>
              {nowPlaying.thumbnail_url && <img src={nowPlaying.thumbnail_url} alt="" style={{ width: 52, height: 52, objectFit: 'cover', borderRadius: 8 }} />}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: GOLD, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{nowPlaying.title}</div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{nowPlaying.artist}</div>
              </div>
            </div>
          ) : (
            <div style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>House playlist</div>
          )}

          {upNext.length > 0 && (
            <>
              <div style={{ fontSize: 11, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.4)', margin: '18px 0 8px' }}>UP NEXT</div>
              {upNext.map((t, i) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 4px', fontSize: 13 }}>
                  <span style={{ color: 'rgba(255,255,255,0.3)', width: 16 }}>{i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.title}</span>
                  <span style={{ color: 'rgba(255,255,255,0.4)' }}>{fmtDur(t.duration_sec)}</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>
    </main>
  )
}
