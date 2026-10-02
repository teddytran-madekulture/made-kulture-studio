'use client'
// Pinch / double-tap zoom for ONE full-screen image on the kiosk tablets
// (Portal mood board viewer). Teddy 2026-10-02: guests study references for
// small details (makeup, fabric, where the light comes from).
//
// ⚠️ Page-level zoom stays OFF (app/kiosk/layout.tsx). One guest pinching the
// whole page leaves the tablet stuck zoomed for the next person. Zoom lives
// ONLY inside this component, and it always finds its way back to 1x:
//   • the parent remounts it per image (key = index), so next/prev resets it;
//   • closing the viewer unmounts it;
//   • IDLE_RESET_MS with no touch snaps it back.
//
// This component owns EVERY gesture in the viewer area so they can't fight:
//   1x, one finger : swipe left/right → onSwipe, tap on the picture → onTap
//   zoomed, 1 finger: drag pans (never swipes — no accidental next image)
//   two fingers     : pinch zoom around the fingers
//   double tap      : 1x → 2.5x at that spot, zoomed → back to 1x
// A single tap waits DOUBLE_TAP_MS before closing, so a double tap can win.
import { useEffect, useRef, useState } from 'react'

const MAX = 5
const DOUBLE_ZOOM = 2.5
const DOUBLE_TAP_MS = 280
const IDLE_RESET_MS = 30_000

type Pt = { x: number; y: number }

export default function ZoomableImage({ src, onSwipe, onTap }: {
  src: string
  onSwipe?: (dir: 1 | -1) => void
  onTap?: () => void
}) {
  const box = useRef<HTMLDivElement>(null)
  const [s, setS] = useState(1)
  const [t, setT] = useState<Pt>({ x: 0, y: 0 })
  const [anim, setAnim] = useState(false)

  const pts = useRef(new Map<number, Pt>())
  const g = useRef<{ s0: number; t0: Pt; d0: number; m0: Pt; p0: Pt; at: number; multi: boolean; onImg: boolean } | null>(null)
  const lastTap = useRef(0)
  const tapTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const idle = useRef<ReturnType<typeof setTimeout> | null>(null)
  const live = useRef({ s: 1, t: { x: 0, y: 0 } })
  live.current = { s, t }

  const center = (): Pt => {
    const r = box.current?.getBoundingClientRect()
    return r ? { x: r.left + r.width / 2, y: r.top + r.height / 2 } : { x: 0, y: 0 }
  }
  // Keep the picture covering the view — never let it be dragged off screen.
  const clamp = (sc: number, tr: Pt): Pt => {
    const r = box.current?.getBoundingClientRect()
    if (!r || sc <= 1) return { x: 0, y: 0 }
    const mx = (r.width * (sc - 1)) / 2, my = (r.height * (sc - 1)) / 2
    return { x: Math.max(-mx, Math.min(mx, tr.x)), y: Math.max(-my, Math.min(my, tr.y)) }
  }
  const apply = (sc: number, tr: Pt, animate: boolean) => {
    const ns = Math.max(1, Math.min(MAX, sc))
    setAnim(animate); setS(ns); setT(clamp(ns, tr))
  }
  const reset = () => apply(1, { x: 0, y: 0 }, true)
  // Zoom so the image point under screen point p stays under p.
  const zoomAt = (p: Pt, ns: number, from: { s: number; t: Pt }, animate: boolean) => {
    const c = center()
    const q = { x: (p.x - c.x - from.t.x) / from.s, y: (p.y - c.y - from.t.y) / from.s }
    apply(ns, { x: p.x - c.x - ns * q.x, y: p.y - c.y - ns * q.y }, animate)
  }

  const poke = () => {
    if (idle.current) clearTimeout(idle.current)
    idle.current = setTimeout(reset, IDLE_RESET_MS)
  }
  useEffect(() => () => {
    if (idle.current) clearTimeout(idle.current)
    if (tapTimer.current) clearTimeout(tapTimer.current)
  }, [])

  const dist = (a: Pt, b: Pt) => Math.hypot(a.x - b.x, a.y - b.y)
  const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

  const down = (e: React.PointerEvent) => {
    poke()
    try { (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId) } catch {}
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const list = Array.from(pts.current.values())
    const { s: s0, t: t0 } = live.current
    if (list.length === 1) {
      g.current = { s0, t0, d0: 0, m0: list[0], p0: list[0], at: Date.now(), multi: false,
        onImg: (e.target as HTMLElement).tagName === 'IMG' }
    } else if (list.length === 2 && g.current) {
      g.current = { ...g.current, s0, t0, d0: dist(list[0], list[1]), m0: mid(list[0], list[1]), multi: true }
    }
  }

  const move = (e: React.PointerEvent) => {
    if (!pts.current.has(e.pointerId) || !g.current) return
    pts.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const list = Array.from(pts.current.values())
    const st = g.current
    if (list.length >= 2 && st.d0 > 0) {
      const m = mid(list[0], list[1])
      const ns = Math.max(1, Math.min(MAX, st.s0 * (dist(list[0], list[1]) / st.d0)))
      // Anchor on the starting midpoint, follow the fingers as they move.
      const c = center()
      const q = { x: (st.m0.x - c.x - st.t0.x) / st.s0, y: (st.m0.y - c.y - st.t0.y) / st.s0 }
      apply(ns, { x: m.x - c.x - ns * q.x, y: m.y - c.y - ns * q.y }, false)
    } else if (list.length === 1 && !st.multi && st.s0 > 1) {
      apply(st.s0, { x: st.t0.x + (list[0].x - st.p0.x), y: st.t0.y + (list[0].y - st.p0.y) }, false)
    }
  }

  const up = (e: React.PointerEvent) => {
    poke()
    const had = pts.current.delete(e.pointerId)
    const st = g.current
    if (!had || !st) return
    if (pts.current.size > 0) {
      // One finger lifted mid-pinch: carry on panning from where things are now.
      const rest = Array.from(pts.current.values())[0]
      g.current = { ...st, s0: live.current.s, t0: live.current.t, d0: 0, p0: rest }
      return
    }
    g.current = null
    if (live.current.s < 1.05) reset()          // pinched back to ~1x → settle exactly at 1x
    if (st.multi) return                        // a pinch is never a tap or a swipe
    const dx = e.clientX - st.p0.x, dy = e.clientY - st.p0.y
    const still = Math.abs(dx) < 10 && Math.abs(dy) < 10 && Date.now() - st.at < 400

    if (still) {
      const now = Date.now()
      if (now - lastTap.current < DOUBLE_TAP_MS) {
        lastTap.current = 0
        if (tapTimer.current) { clearTimeout(tapTimer.current); tapTimer.current = null }
        if (live.current.s > 1) reset()
        else zoomAt({ x: e.clientX, y: e.clientY }, DOUBLE_ZOOM, live.current, true)
        return
      }
      lastTap.current = now
      // Single tap: back to the grid — but only at 1x, only on the picture,
      // and only once we know it wasn't the first half of a double tap.
      if (st.s0 <= 1 && st.onImg && onTap) {
        if (tapTimer.current) clearTimeout(tapTimer.current)
        tapTimer.current = setTimeout(() => { tapTimer.current = null; onTap() }, DOUBLE_TAP_MS)
      }
      return
    }
    // Swipe only at 1x — zoomed in, a drag is a pan.
    if (st.s0 <= 1 && onSwipe && Math.abs(dx) >= 50 && Math.abs(dx) > Math.abs(dy)) onSwipe(dx < 0 ? 1 : -1)
  }

  return (
    <div ref={box}
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}
      style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 12, overflow: 'hidden', touchAction: 'none' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" draggable={false}
        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8, userSelect: 'none',
          transform: `translate(${t.x}px, ${t.y}px) scale(${s})`, transformOrigin: 'center center',
          transition: anim ? 'transform 220ms ease' : 'none', willChange: 'transform' }} />
    </div>
  )
}
