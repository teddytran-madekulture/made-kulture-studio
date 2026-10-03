'use client'
// /projector?key=<KIOSK_KEY> — runs fullscreen on the projector laptop.
// No image: a big QR ("scan to put an image on the wall").
// Image: the image, edge to edge, nothing else (the wall is in the shot).
// Click: toggle a small corner QR.  Double-click or F: fullscreen.  C: fill/fit.
// Scroll / trackpad pinch: zoom at the cursor.  Drag: move.  Arrows: nudge.
// + / -: zoom.  R or 0: reset.  Position is remembered per image on this laptop.
import { useEffect, useMemo, useRef, useState } from 'react'
import qrcode from 'qrcode-generator'

const POLL_MS = 5000
const CHAMP = '#c9b27e'

function qrPath(url: string) {
  const q = qrcode(0, 'M'); q.addData(url); q.make()
  const n = q.getModuleCount()
  let d = ''
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) d += `M${c} ${r}h1v1h-1z`
  return { d, n }
}

function QR({ url, size }: { url: string; size: number }) {
  const { d, n } = useMemo(() => qrPath(url), [url])
  const pad = 2
  return (
    <svg width={size} height={size} viewBox={`${-pad} ${-pad} ${n + pad * 2} ${n + pad * 2}`} style={{ background: '#fff', display: 'block', borderRadius: 6 }}>
      <path d={d} fill="#000" shapeRendering="crispEdges" />
    </svg>
  )
}

export default function ProjectorPage() {
  const [key, setKey] = useState<string | null>(null)
  const [img, setImg] = useState<string | null>(null)
  const [uploadUrl, setUploadUrl] = useState<string | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [showQr, setShowQr] = useState(false)
  const [cover, setCover] = useState(false)
  const [cursor, setCursor] = useState(true)
  const v = useRef<string | null>(null)
  const [view, setView] = useState({ s: 1, x: 0, y: 0 })
  const stage = useRef<HTMLDivElement>(null)
  const drag = useRef<{ x: number; y: number; moved: boolean } | null>(null)
  const viewKey = (n: string | null) => `projector-view:${n ?? ''}`

  // globals.css zooms desktop body 1.25x; the wall must be 1:1.
  useEffect(() => {
    const prev = document.body.style.zoom
    document.body.style.zoom = '1'
    document.body.style.background = '#000'
    setKey(new URLSearchParams(window.location.search).get('key'))
    return () => { document.body.style.zoom = prev }
  }, [])

  useEffect(() => {
    if (!key) return
    let stop = false
    const tick = async () => {
      if (document.hidden) return
      try {
        const r = await fetch(`/api/projector?key=${encodeURIComponent(key)}&v=${encodeURIComponent(v.current ?? '')}`, { cache: 'no-store' })
        const j = await r.json()
        if (stop) return
        if (!r.ok) { setErr(j.error || 'Error'); return }
        setErr(null)
        setUploadUrl(j.uploadUrl)
        if (j.v === null) { v.current = null; setImg(null) }
        else if (!j.same) {
          v.current = j.v; setImg(j.url); setShowQr(false)
          let saved = { s: 1, x: 0, y: 0 }
          try { const raw = localStorage.getItem(viewKey(j.v)); if (raw) saved = JSON.parse(raw) } catch {}
          setView(saved)
        }
      } catch { /* offline blip: keep showing what we have */ }
    }
    tick()
    const id = setInterval(tick, POLL_MS)
    return () => { stop = true; clearInterval(id) }
  }, [key])

  // Hide the cursor when idle — it would be projected onto the set.
  useEffect(() => {
    let t: any
    const wake = () => { setCursor(true); clearTimeout(t); t = setTimeout(() => setCursor(false), 2500) }
    const keyd = (e: KeyboardEvent) => {
      if (e.key === 'f' || e.key === 'F') document.documentElement.requestFullscreen?.().catch(() => {})
      if (e.key === 'c' || e.key === 'C') setCover(x => !x)
      if (e.key === 'q' || e.key === 'Q') setShowQr(x => !x)
      const step = e.shiftKey ? 60 : 15
      if (e.key === 'ArrowLeft') setView(w => ({ ...w, x: w.x - step }))
      if (e.key === 'ArrowRight') setView(w => ({ ...w, x: w.x + step }))
      if (e.key === 'ArrowUp') setView(w => ({ ...w, y: w.y - step }))
      if (e.key === 'ArrowDown') setView(w => ({ ...w, y: w.y + step }))
      if (e.key === '+' || e.key === '=') zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.08)
      if (e.key === '-' || e.key === '_') zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1 / 1.08)
      if (e.key === 'r' || e.key === 'R' || e.key === '0') setView({ s: 1, x: 0, y: 0 })
    }
    window.addEventListener('mousemove', wake); window.addEventListener('keydown', keyd); wake()
    return () => { window.removeEventListener('mousemove', wake); window.removeEventListener('keydown', keyd); clearTimeout(t) }
  }, [])

  // Zoom keeping the point under the cursor fixed.
  function zoomAt(cx: number, cy: number, k: number) {
    setView(w => {
      const s2 = Math.min(8, Math.max(0.2, w.s * k))
      const kk = s2 / w.s
      return { s: s2, x: cx - (cx - w.x) * kk, y: cy - (cy - w.y) * kk }
    })
  }

  // Non-passive so a trackpad pinch (ctrl+wheel) zooms the image, not the page.
  useEffect(() => {
    const el = stage.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const k = Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))
      zoomAt(e.clientX, e.clientY, k)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  })

  useEffect(() => {
    if (!v.current) return
    try { localStorage.setItem(viewKey(v.current), JSON.stringify(view)) } catch {}
  }, [view])

  const base: React.CSSProperties = { position: 'fixed', inset: 0, background: '#000', overflow: 'hidden', cursor: cursor ? 'default' : 'none', userSelect: 'none' }

  if (!key) return <div style={{ ...base, color: '#888', display: 'grid', placeItems: 'center', fontFamily: 'sans-serif' }}>Missing key.</div>
  if (err) return <div style={{ ...base, color: '#888', display: 'grid', placeItems: 'center', fontFamily: 'sans-serif' }}>{err}</div>

  return (
    <div style={base} ref={stage}
      onMouseDown={e => { if (img && e.button === 0) drag.current = { x: e.clientX, y: e.clientY, moved: false } }}
      onMouseMove={e => {
        const d = drag.current
        if (!d) return
        const dx = e.clientX - d.x, dy = e.clientY - d.y
        if (!d.moved && Math.abs(dx) + Math.abs(dy) < 4) return
        d.moved = true; d.x = e.clientX; d.y = e.clientY
        setView(w => ({ ...w, x: w.x + dx, y: w.y + dy }))
      }}
      onMouseUp={() => { const d = drag.current; drag.current = null; if (img && d && !d.moved) setShowQr(x => !x) }}
      onMouseLeave={() => { drag.current = null }}
      onDoubleClick={() => document.documentElement.requestFullscreen?.().catch(() => {})}>
      {img ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={img} alt="" draggable={false} style={{ width: '100%', height: '100%', objectFit: cover ? 'cover' : 'contain', display: 'block', transformOrigin: '0 0', transform: `translate(${view.x}px, ${view.y}px) scale(${view.s})`, willChange: 'transform', pointerEvents: 'none' }} />
      ) : uploadUrl ? (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 28, fontFamily: 'Georgia, serif', color: CHAMP }}>
          <div style={{ letterSpacing: '0.35em', fontSize: 14, fontFamily: 'sans-serif' }}>MADE KULTURE · PROJECTOR</div>
          <QR url={uploadUrl} size={300} />
          <div style={{ fontSize: 30 }}>Scan to put your image on the wall</div>
          <div style={{ fontSize: 14, color: '#777', fontFamily: 'sans-serif' }}>Double-click for fullscreen</div>
        </div>
      ) : null}
      {img && showQr && uploadUrl && (
        <div style={{ position: 'absolute', right: 24, bottom: 24, padding: 10, background: 'rgba(0,0,0,0.75)', borderRadius: 10, textAlign: 'center', color: CHAMP, fontFamily: 'sans-serif', fontSize: 12, letterSpacing: '0.1em' }}>
          <QR url={uploadUrl} size={150} />
          <div style={{ marginTop: 8 }}>SCAN TO CHANGE</div>
        </div>
      )}
    </div>
  )
}
