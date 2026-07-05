'use client'
import { useEffect, useRef, useState } from 'react'

/**
 * Modal crop tool. Shows the image inside a fixed-ratio frame; the member pans
 * (drag) and zooms (slider) to compose the shot, then we export the visible
 * region as a JPEG blob at the target ratio.
 *
 * - `aspect` is width / height (e.g. 4/5 = 0.8, taller than wide).
 * - Cropping a local File (object URL) needs no CORS. Cropping an existing
 *   stored image needs the canvas source loaded with crossOrigin — pass
 *   `crossOrigin` for that case.
 */
export default function ImageCropper({
  src,
  aspect,
  crossOrigin = false,
  outWidth = 1000,
  onCancel,
  onCropped,
}: {
  src: string
  aspect: number
  crossOrigin?: boolean
  outWidth?: number
  onCancel: () => void
  onCropped: (blob: Blob) => void
}) {
  const FRAME_W = 300
  const FRAME_H = Math.round(FRAME_W / aspect)

  const [nat, setNat] = useState<{ w: number; h: number } | null>(null)
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const imgRef = useRef<HTMLImageElement | null>(null)
  const drag = useRef<{ px: number; py: number; ox: number; oy: number } | null>(null)

  // Load the image (with crossOrigin when we'll need to read it back onto a canvas).
  useEffect(() => {
    const im = new Image()
    if (crossOrigin) im.crossOrigin = 'anonymous'
    im.onload = () => {
      imgRef.current = im
      const base = Math.max(FRAME_W / im.naturalWidth, FRAME_H / im.naturalHeight)
      const dW = im.naturalWidth * base
      const dH = im.naturalHeight * base
      setNat({ w: im.naturalWidth, h: im.naturalHeight })
      setZoom(1)
      setOffset({ x: (FRAME_W - dW) / 2, y: (FRAME_H - dH) / 2 })
    }
    im.onerror = () => setError('Could not load this image.')
    im.src = src
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [src])

  const base = nat ? Math.max(FRAME_W / nat.w, FRAME_H / nat.h) : 1
  const dispW = nat ? nat.w * base * zoom : FRAME_W
  const dispH = nat ? nat.h * base * zoom : FRAME_H

  const clamp = (x: number, y: number, dw = dispW, dh = dispH) => ({
    x: Math.min(0, Math.max(FRAME_W - dw, x)),
    y: Math.min(0, Math.max(FRAME_H - dh, y)),
  })

  const onZoom = (z: number) => {
    if (!nat) return
    const oldDw = nat.w * base * zoom, oldDh = nat.h * base * zoom
    const newDw = nat.w * base * z, newDh = nat.h * base * z
    // keep the point under the frame centre fixed
    const cx = FRAME_W / 2, cy = FRAME_H / 2
    const fx = (cx - offset.x) / oldDw, fy = (cy - offset.y) / oldDh
    const nx = cx - fx * newDw, ny = cy - fy * newDh
    setZoom(z)
    setOffset(clamp(nx, ny, newDw, newDh))
  }

  const onDown = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    drag.current = { px: e.clientX, py: e.clientY, ox: offset.x, oy: offset.y }
  }
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current) return
    const nx = drag.current.ox + (e.clientX - drag.current.px)
    const ny = drag.current.oy + (e.clientY - drag.current.py)
    setOffset(clamp(nx, ny))
  }
  const onUp = () => { drag.current = null }

  const doCrop = () => {
    if (!nat || !imgRef.current) return
    setBusy(true)
    setError('')
    try {
      const s = base * zoom
      const sx = -offset.x / s
      const sy = -offset.y / s
      const sW = FRAME_W / s
      const sH = FRAME_H / s
      const outW = outWidth
      const outH = Math.round(outW / aspect)
      const canvas = document.createElement('canvas')
      canvas.width = outW; canvas.height = outH
      const ctx = canvas.getContext('2d')
      if (!ctx) { setError('Crop failed.'); setBusy(false); return }
      ctx.drawImage(imgRef.current, sx, sy, sW, sH, 0, 0, outW, outH)
      canvas.toBlob(b => {
        if (b) onCropped(b)
        else { setError('Crop failed.'); setBusy(false) }
      }, 'image/jpeg', 0.85)
    } catch {
      setError('Could not process this image.')
      setBusy(false)
    }
  }

  const btn = (primary: boolean): React.CSSProperties => ({
    flex: 1, padding: '11px 0', borderRadius: 4, fontFamily: 'Inter', fontSize: 13, fontWeight: 600,
    letterSpacing: '0.04em', cursor: 'pointer',
    background: primary ? '#fff' : 'transparent',
    color: primary ? '#080808' : 'rgba(255,255,255,0.7)',
    border: primary ? '1px solid #fff' : '1px solid rgba(255,255,255,0.25)',
  })

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200, padding: 20 }}>
      <div style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: 20, width: FRAME_W + 40 }}>
        <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 12, textAlign: 'center' }}>
          Drag to reposition · zoom to fill the frame
        </div>

        <div
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
          style={{ position: 'relative', width: FRAME_W, height: FRAME_H, margin: '0 auto', borderRadius: 6, overflow: 'hidden', background: '#000', cursor: 'grab', touchAction: 'none' }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" draggable={false}
            style={{ position: 'absolute', left: offset.x, top: offset.y, width: dispW, height: dispH, maxWidth: 'none', userSelect: 'none', pointerEvents: 'none' }} />
        </div>

        <input type="range" min={1} max={3} step={0.01} value={zoom}
          onChange={e => onZoom(parseFloat(e.target.value))}
          style={{ width: '100%', margin: '14px 0 4px', accentColor: '#fff' }} />

        {error && (
          <div style={{ fontFamily: 'Inter', fontSize: 12, color: '#ff6b6b', margin: '4px 0 8px', textAlign: 'center' }}>{error}</div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
          <button type="button" onClick={onCancel} disabled={busy} style={btn(false)}>Cancel</button>
          <button type="button" onClick={doCrop} disabled={busy || !nat} style={btn(true)}>{busy ? 'Saving…' : 'Save photo'}</button>
        </div>
      </div>
    </div>
  )
}
