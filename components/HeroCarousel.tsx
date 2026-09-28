'use client'
// Home hero carousel. Slide 1 is the original hero (unchanged); extra slides
// come from Website Editor → Home → Hero banners (lib/hero-slides.ts).
//
// Motion: auto-advances every `intervalSec`, pauses while hovered / focused /
// touched or while the tab is hidden, swipes on phones, and has dots + arrows.
// With "reduce motion" on it never auto-plays and changes without sliding.
// With ONE slide it renders exactly like the old static hero — no controls.
//
// ⚠️ Slides animate in two phases (prep → run) so the incoming slide always
// enters from the side you're heading toward, including the wrap from the last
// slide back to the first. A plain translateX((i - active) * 100%) would drag
// every slide in between across the screen on that wrap.

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { fmt as nl } from '@/lib/fmt'

export interface CarouselSlide {
  key: string
  imageUrl: string | null
  objectPosition: string
  eyebrow: string
  headline: string
  paragraph: string
  primary: { label: string; href: string } | null
  secondary: { label: string; href: string } | null
  finePrint: string
}

const EASE = 'cubic-bezier(0.22, 0.61, 0.36, 1)'
const SLIDE_MS = 650
const mono = '"JetBrains Mono", ui-monospace, monospace'

const Arrow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" /></svg>
)

function SlideContent({ s, isFirst, isMobile, fixedHeight, interactive }: {
  s: CarouselSlide; isFirst: boolean; isMobile: boolean; fixedHeight: boolean; interactive: boolean
}) {
  const [hover, setHover] = useState<'primary' | 'secondary' | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const [scale, setScale] = useState(1)

  // Desktop: shrink the text block to fit the band height so nothing clips
  // (same rule the single hero always had). Mobile: natural size.
  useEffect(() => {
    if (isMobile || !fixedHeight) { setScale(1); return }
    const el = contentRef.current
    const slide = el?.closest('[data-hero-slide]') as HTMLElement | null
    if (!el || !slide) return
    const fit = () => {
      const cs = getComputedStyle(slide)
      const avail = slide.clientHeight - (parseFloat(cs.paddingTop) || 0) - (parseFloat(cs.paddingBottom) || 0)
      const natural = el.offsetHeight
      if (avail > 0 && natural > 0) setScale(Math.min(1, avail / natural))
    }
    fit()
    const ro = new ResizeObserver(fit)
    ro.observe(slide); ro.observe(el)
    window.addEventListener('resize', fit)
    ;(document as any).fonts?.ready?.then(fit).catch(() => {})
    return () => { ro.disconnect(); window.removeEventListener('resize', fit) }
  }, [isMobile, fixedHeight])

  const H = isFirst ? 'h1' : 'h2'
  const tab = interactive ? 0 : -1
  const btn = (kind: 'primary' | 'secondary', b: { label: string; href: string }) => {
    const solid = kind === 'primary' ? hover !== 'secondary' : hover === 'secondary'
    return (
      <Link key={kind} href={b.href} tabIndex={tab}
        onMouseEnter={() => setHover(kind)} onMouseLeave={() => setHover(null)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: isMobile ? 'space-between' : 'flex-start', gap: 24,
          background: solid ? '#fff' : 'transparent', color: solid ? '#080808' : '#fff',
          border: solid ? '1px solid transparent' : `1px solid ${kind === 'primary' ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.18)'}`,
          padding: '16px 24px', textDecoration: 'none', transition: 'background 0.25s ease, color 0.25s ease, border-color 0.25s ease',
        }}>
        <span style={{ fontFamily: mono, fontSize: 12, fontWeight: 500, letterSpacing: '0.25em', textTransform: 'uppercase' }}>{b.label}</span>
        <Arrow />
      </Link>
    )
  }

  return (
    <div ref={contentRef} style={{ maxWidth: 700, transform: isMobile ? undefined : `scale(${scale})`, transformOrigin: 'left bottom' }}>
      {s.eyebrow && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
          <div style={{ width: 40, height: 1, background: 'rgba(255,255,255,0.5)' }} />
          <span className="label">{s.eyebrow}</span>
        </div>
      )}
      <H style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(84px, 17vw, 170px)', color: '#fff', marginBottom: 28, lineHeight: 0.9, letterSpacing: '0.005em', textTransform: 'uppercase' }}>
        {nl(s.headline)}
      </H>
      {s.paragraph && (
        <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6, marginBottom: 40, maxWidth: 420 }}>{nl(s.paragraph)}</p>
      )}
      {(s.primary || s.secondary) && (
        <div style={{ display: 'flex', gap: 12, flexDirection: isMobile ? 'column' : 'row' }}>
          {s.primary && btn('primary', s.primary)}
          {s.secondary && btn('secondary', s.secondary)}
        </div>
      )}
      {s.finePrint && (
        <div style={{ marginTop: 20, fontFamily: mono, fontSize: 11, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase' }}>{nl(s.finePrint)}</div>
      )}
    </div>
  )
}

type Stage = { active: number; from: number | null; dir: 1 | -1; phase: 'idle' | 'prep' | 'run' }

export default function HeroCarousel({ slides, intervalSec, isMobile, heightVh, pageMax }: {
  slides: CarouselSlide[]; intervalSec: number; isMobile: boolean; heightVh: number; pageMax: number
}) {
  const n = slides.length
  const [stage, setStage] = useState<Stage>({ active: 0, from: null, dir: 1, phase: 'idle' })
  const [paused, setPaused] = useState(false)
  const [reduced, setReduced] = useState(false)
  const [hidden, setHidden] = useState(false)
  // Only fetch a slide's photo once it's current or next up — extra banners
  // shouldn't cost a phone visitor megabytes they may never swipe to.
  const [loaded, setLoaded] = useState<Set<number>>(() => new Set([0, 1]))
  const touch = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const upd = () => setReduced(mq.matches)
    upd(); mq.addEventListener?.('change', upd)
    const vis = () => setHidden(document.visibilityState === 'hidden')
    vis(); document.addEventListener('visibilitychange', vis)
    return () => { mq.removeEventListener?.('change', upd); document.removeEventListener('visibilitychange', vis) }
  }, [])

  const go = useCallback((to: number, dir: 1 | -1) => {
    setStage(st => {
      if (st.phase !== 'idle' || n < 2) return st
      const target = ((to % n) + n) % n
      if (target === st.active) return st
      if (reduced) return { active: target, from: null, dir, phase: 'idle' }
      return { active: target, from: st.active, dir, phase: 'prep' }
    })
  }, [n, reduced])
  const next = useCallback(() => go(stage.active + 1, 1), [go, stage.active])
  const prev = useCallback(() => go(stage.active - 1, -1), [go, stage.active])

  // prep → run on the next frame (so the incoming slide is placed before it moves) → idle.
  useEffect(() => {
    if (stage.phase === 'prep') {
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setStage(st => st.phase === 'prep' ? { ...st, phase: 'run' } : st)))
      return () => cancelAnimationFrame(r)
    }
    if (stage.phase === 'run') {
      const t = setTimeout(() => setStage(st => ({ ...st, from: null, phase: 'idle' })), SLIDE_MS + 30)
      return () => clearTimeout(t)
    }
  }, [stage.phase])

  useEffect(() => {
    setLoaded(prevSet => {
      const nx = (stage.active + 1) % Math.max(n, 1)
      if (prevSet.has(stage.active) && prevSet.has(nx)) return prevSet
      const s = new Set(prevSet); s.add(stage.active); s.add(nx); return s
    })
  }, [stage.active, n])

  // Auto-advance. Restarts after every change, so a manual swipe gets a full interval.
  useEffect(() => {
    if (n < 2 || paused || reduced || hidden || stage.phase !== 'idle') return
    const t = setTimeout(next, Math.max(4, intervalSec) * 1000)
    return () => clearTimeout(t)
  }, [n, paused, reduced, hidden, stage.phase, stage.active, intervalSec, next])

  const multi = n > 1
  const posOf = (i: number): { x: number; visible: boolean; animate: boolean } => {
    const { active, from, dir, phase } = stage
    if (phase === 'idle' || from === null) return { x: i === active ? 0 : 100, visible: i === active, animate: false }
    if (i === active) return { x: phase === 'prep' ? dir * 100 : 0, visible: true, animate: phase === 'run' }
    if (i === from) return { x: phase === 'prep' ? 0 : -dir * 100, visible: true, animate: phase === 'run' }
    return { x: 100, visible: false, animate: false }
  }

  const onTouchStart = (e: React.TouchEvent) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; setPaused(true) }
  const onTouchEnd = (e: React.TouchEvent) => {
    const start = touch.current; touch.current = null; setPaused(false)
    if (!start || !multi) return
    const t = e.changedTouches[0]
    const dx = t.clientX - start.x, dy = t.clientY - start.y
    // Horizontal and deliberate only — a vertical scroll must never flip slides.
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) (dx < 0 ? next : prev)()
  }

  const ctrlBtn: React.CSSProperties = {
    width: 44, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: 'rgba(8,8,8,0.35)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', cursor: 'pointer', padding: 0,
  }

  return (
    <section
      aria-roledescription={multi ? 'carousel' : undefined}
      aria-label={multi ? 'Featured' : undefined}
      onMouseEnter={() => multi && setPaused(true)} onMouseLeave={() => setPaused(false)}
      onFocus={() => multi && setPaused(true)} onBlur={() => setPaused(false)}
      onTouchStart={multi ? onTouchStart : undefined} onTouchEnd={multi ? onTouchEnd : undefined}
      style={{
        position: 'relative', display: 'grid', gridTemplateColumns: '1fr', gridTemplateRows: '1fr',
        ...(isMobile ? { minHeight: '85vh' } : { height: `${heightVh}vh` }),
        border: 'none', overflow: 'hidden', background: '#080808',
      }}>
      {slides.map((s, i) => {
        const p = posOf(i)
        return (
          <div key={s.key} data-hero-slide
            role={multi ? 'group' : undefined}
            aria-roledescription={multi ? 'slide' : undefined}
            aria-label={multi ? `${i + 1} of ${n}` : undefined}
            aria-hidden={!p.visible || undefined}
            style={{
              gridArea: '1 / 1', position: 'relative', display: 'flex', alignItems: 'flex-end',
              padding: isMobile ? `96px 0 ${multi ? 64 : 48}px` : '84px 0 60px', overflow: 'hidden',
              transform: `translateX(${p.x}%)`, visibility: p.visible ? 'visible' : 'hidden',
              transition: p.animate ? `transform ${SLIDE_MS}ms ${EASE}` : 'none',
              willChange: multi ? 'transform' : undefined,
            }}>
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, #1a0a0a 0%, #0d0d0d 40%, #1a1208 100%)' }}>
              {s.imageUrl && loaded.has(i) && (
                <img src={s.imageUrl} alt="" decoding="async" fetchPriority={i === 0 ? 'high' : 'low'}
                  style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: s.objectPosition }} />
              )}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, #080808 0%, rgba(8,8,8,0.55) 24%, rgba(8,8,8,0.15) 50%, transparent 78%)' }} />
            </div>
            <div style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: pageMax, margin: '0 auto', paddingLeft: isMobile ? 20 : 40, paddingRight: isMobile ? 20 : 40, boxSizing: 'border-box' }}>
              <SlideContent s={s} isFirst={i === 0} isMobile={isMobile} fixedHeight={!isMobile} interactive={p.visible && i === stage.active} />
            </div>
          </div>
        )
      })}

      {/* Coordinates (hidden on mobile to avoid overlapping the headline) */}
      {!isMobile && (
        <div style={{ position: 'absolute', top: 100, right: 40, textAlign: 'right', zIndex: 2, pointerEvents: 'none' }}>
          <div className="label">HOUSTON / TX</div>
          <div className="label" style={{ marginTop: 4 }}>29.76°N · 95.36°W</div>
        </div>
      )}

      {multi && !isMobile && (
        <>
          <button type="button" aria-label="Previous slide" onClick={prev}
            style={{ ...ctrlBtn, position: 'absolute', zIndex: 3, left: 24, top: '50%', transform: 'translateY(-50%)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="15 18 9 12 15 6" /></svg>
          </button>
          <button type="button" aria-label="Next slide" onClick={next}
            style={{ ...ctrlBtn, position: 'absolute', zIndex: 3, right: 24, top: '50%', transform: 'translateY(-50%)' }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polyline points="9 18 15 12 9 6" /></svg>
          </button>
        </>
      )}

      {multi && (
        <div style={{
          position: 'absolute', zIndex: 3, left: 0, right: 0, bottom: isMobile ? 22 : 28,
          display: 'flex', justifyContent: 'center', gap: 8, pointerEvents: 'none',
        }}>
          {slides.map((s, i) => (
            <button key={s.key} type="button" aria-label={`Go to slide ${i + 1}`} aria-current={i === stage.active || undefined}
              onClick={() => go(i, i > stage.active ? 1 : -1)}
              style={{ pointerEvents: 'auto', width: i === stage.active ? 28 : 8, height: 8, padding: 0, border: 'none', cursor: 'pointer', borderRadius: 4, background: i === stage.active ? '#fff' : 'rgba(255,255,255,0.35)', transition: 'width 0.3s ease, background 0.3s ease' }} />
          ))}
        </div>
      )}
    </section>
  )
}
