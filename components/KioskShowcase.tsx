'use client'
// SHOWCASE — the kiosk tablets' idle screen (2026-09-30). When nobody is booked
// on this set (and nobody is about to be), the tablet turns into a small gallery
// frame for the Featured Editorial: photos crossfading full height, uncropped,
// with the title and EVERY credit always visible (nobody hunts for a button on
// a wall screen) and a QR to the post.
//
// Any tap anywhere dismisses it back to the normal home screen (on CLICK, so
// the dismissing tap is swallowed here and never presses a tile underneath). The page
// (app/kiosk/page.tsx) decides WHEN it shows; this only draws it.
//
// Works in both orientations: set tablets are mounted PORTRAIT (photo on top,
// credits band below); a landscape door screen puts the credits beside it.
// Full brightness, no dimming — Teddy's call: the tablets aren't bright enough
// to affect a shoot.
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import qrcode from 'qrcode-generator'

export interface ShowcaseEditorial {
  id?: string
  setSlug?: string
  title: string; subtitle: string; setName: string; postUrl: string
  credits: { role: string; handle: string }[]; photos: string[]; intervalSec: number
}

const CHAMP = '#c9b27e'
const CHAMP_DIM = 'rgba(201,178,126,0.6)'

// Cycles through EVERY editorial in rotation: each plays through its photos
// with its own credits, then the next one takes over (the website shows one per
// visit; an idle tablet has time for all of them).
// ── Which order THIS tablet plays them in (2026-09-30) ──────────────────────
// 1. Editorials shot on this tablet's own set come first — standing in Rosé,
//    you see real work made in Rosé.
// 2. The rest follow, each tablet starting at a different point so two idle
//    tablets side by side don't show the same shoot.
// The stagger is a fixed per-set offset (not random, not a hash): with only a
// couple of editorials, a hash put Set A and Set C — the two tablets actually
// mounted — on the SAME one. Order = the order tablets went up; add new sets at
// the end. A tablet with no ?set= (door) uses offset 0.
const STAGGER_ORDER = ['set-a', 'set-c', 'set-b', 'set-d', 'concrete', 'vintage', 'cottage', 'studio-one', 'watering-hole', 'the-tank']

export function orderForTablet<T extends { setSlug?: string }>(items: T[], setSlug: string | null): T[] {
  const own = setSlug ? items.filter(e => e.setSlug === setSlug) : []
  const rest = setSlug ? items.filter(e => e.setSlug !== setSlug) : items.slice()
  if (rest.length > 1) {
    const idx = setSlug ? Math.max(0, STAGGER_ORDER.indexOf(setSlug)) : 0
    const off = idx % rest.length
    rest.push(...rest.splice(0, off))
  }
  return [...own, ...rest]
}

// `footer` (2026-10-06): the NOW PLAYING bar + STAFF/MUSIC buttons stay on
// screen under the gallery — the showcase used to cover them whenever the set
// was empty. Taps on the footer do NOT dismiss the showcase.
export default function KioskShowcase({ items: raw, setSlug = null, onDismiss, portrait, footer }: { items: ShowcaseEditorial[]; setSlug?: string | null; onDismiss: () => void; portrait: boolean; footer?: ReactNode }) {
  const items = useMemo(() => orderForTablet(raw, setSlug), [raw, setSlug])
  // A running count, not an index: with ONE editorial the index would stay 0,
  // nothing would remount, and it would freeze on the last photo.
  const [turn, setTurn] = useState(0)
  const cur = items[turn % Math.max(items.length, 1)]
  if (!cur) return null
  return <One key={turn} e={cur} onDismiss={onDismiss} portrait={portrait} footer={footer}
    onCycleDone={() => setTurn(x => x + 1)} />
}

function One({ e, onDismiss, portrait, onCycleDone, footer }: { e: ShowcaseEditorial; onDismiss: () => void; portrait: boolean; onCycleDone: () => void; footer?: ReactNode }) {
  const [i, setI] = useState(0)
  const n = e.photos.length
  // ⚠️ Refs, not deps: the kiosk page re-renders every 5s (its clock tick) and
  // hands down fresh callbacks each time. With them in the deps the interval
  // would restart every 5s and a 6s+ step would NEVER fire.
  const iRef = useRef(0)
  const doneRef = useRef(onCycleDone)
  doneRef.current = onCycleDone
  useEffect(() => {
    const step = Math.max(4, e.intervalSec + 2) * 1000
    const t = setInterval(() => {
      if (iRef.current + 1 >= n) { doneRef.current(); return }   // last photo shown → next editorial
      iRef.current += 1; setI(iRef.current)
    }, step)
    return () => clearInterval(t)
  }, [n, e.intervalSec])

  const qr = useMemo(() => {
    if (!e.postUrl) return null
    const q = qrcode(0, 'M'); q.addData(e.postUrl); q.make()
    const size = q.getModuleCount()
    let d = ''
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (q.isDark(r, c)) d += `M${c},${r}h1v1h-1z`
    return { n: size, d }
  }, [e.postUrl])

  const credits = e.credits.filter(c => c.handle || c.role)
  const twoCol = credits.length > 4

  const photo = (
    <div style={{ position: 'relative', flex: 1, minHeight: 0, minWidth: 0 }}>
      {e.photos.map((src, k) => (
        <img key={src} src={src} alt="" draggable={false}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain',
                   opacity: k === i ? 1 : 0, transition: 'opacity 1.6s ease' }} />
      ))}
    </div>
  )

  const band = (
    <div style={{
      flexShrink: 0, display: 'flex', gap: 24, alignItems: 'flex-end',
      ...(portrait ? { padding: '22px 30px 30px' } : { width: '38%', flexDirection: 'column', alignItems: 'stretch', justifyContent: 'flex-end', padding: '40px 36px' }),
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.32em', color: CHAMP_DIM }}>
          FEATURED EDITORIAL{e.setName ? ` · ${e.setName.toUpperCase()}` : ''}
        </div>
        <div style={{ fontFamily: 'Anton, "Bebas Neue", Inter, sans-serif', fontSize: portrait ? 54 : 60, lineHeight: 1, marginTop: 10, color: '#fff', textTransform: 'uppercase', letterSpacing: '0.01em' }}>
          {e.title}
        </div>
        {e.subtitle && <div style={{ fontSize: 18, color: 'rgba(255,255,255,0.55)', marginTop: 6 }}>{e.subtitle}</div>}
        {credits.length > 0 && (
          <div style={{ display: 'grid', gridTemplateColumns: twoCol && portrait ? '1fr 1fr' : '1fr', columnGap: 28, rowGap: 7, marginTop: 18, paddingTop: 16, borderTop: '1px solid rgba(201,178,126,0.22)' }}>
            {credits.map((c, k) => (
              <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, minWidth: 0 }}>
                <span style={{ fontSize: 12, letterSpacing: '0.14em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.45)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.role}</span>
                {c.handle && <span style={{ fontSize: 16, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>@{c.handle}</span>}
              </div>
            ))}
          </div>
        )}
      </div>
      {qr && (
        <div style={{ flexShrink: 0, textAlign: 'center', ...(portrait ? {} : { alignSelf: 'flex-start', marginTop: 20 }) }}>
          <div style={{ background: '#fff', padding: 8, borderRadius: 8, width: portrait ? 112 : 128 }}>
            <svg viewBox={`0 0 ${qr.n} ${qr.n}`} style={{ display: 'block', width: '100%', height: 'auto' }} shapeRendering="crispEdges">
              <path d={qr.d} fill="#0b0b0d" />
            </svg>
          </div>
          <div style={{ fontSize: 10, letterSpacing: '0.22em', color: CHAMP_DIM, marginTop: 8 }}>SEE THE POST</div>
        </div>
      )}
    </div>
  )

  return (
    <div onClick={onDismiss} role="button" aria-label="Tap to return"
      style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#050505', color: '#fff', fontFamily: 'Inter, sans-serif',
               display: 'flex', flexDirection: 'column', cursor: 'pointer', userSelect: 'none' }}>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: portrait ? 'column' : 'row' }}>
        <div style={{ flex: 1, minHeight: 0, minWidth: 0, display: 'flex', padding: portrait ? '28px 28px 0' : '28px 0 28px 28px' }}>{photo}</div>
        {band}
      </div>
      {footer && <div onClick={ev => ev.stopPropagation()} style={{ flexShrink: 0, cursor: 'default' }}>{footer}</div>}
      {n > 1 && (
        <div style={{ position: 'absolute', top: 14, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6, pointerEvents: 'none' }}>
          {e.photos.map((_, k) => (
            <span key={k} style={{ width: k === i ? 18 : 6, height: 4, borderRadius: 2, background: k === i ? CHAMP : 'rgba(255,255,255,0.22)', transition: 'width 0.4s, background 0.4s' }} />
          ))}
        </div>
      )}
    </div>
  )
}
