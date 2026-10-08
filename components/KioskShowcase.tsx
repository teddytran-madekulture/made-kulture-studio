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
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import qrcode from 'qrcode-generator'

export interface ShowcaseEditorial {
  id?: string
  setSlug?: string
  title: string; subtitle: string; setName: string; postUrl: string
  promoLabel?: string; promoUrl?: string; promoCta?: string   // editorial used as an ad
  promoHeadline?: string; promoText?: string                  // big ad text over the photo
  credits: { role: string; handle: string }[]; photos: string[]; intervalSec: number
}

const CHAMP = '#c9b27e'
const CHAMP_DIM = 'rgba(201,178,126,0.6)'

// ── CLOCK SCHEDULE (2026-10-08) ─────────────────────────────────────────────
// Every tablet works out what to show from the WALL CLOCK, not from when its
// own screen went idle. Before this, each tablet started at a different
// editorial but then ran on its own timer from its own idle moment, so within
// a few minutes two tablets side by side were on the same shoot.
//
// Time is cut into fixed SLOT_MS slots. Slot s on a tablet at position k shows
// playlist[(s + k) % playlist.length], so at any instant neighbouring tablets
// show DIFFERENT editorials and all switch together. Photos inside a slot are
// clock-driven too: a tablet that goes idle mid-slot lands on the right photo.
//
// Ads get extra air time: every editorial used as an ad (promoLabel/promoUrl)
// is played between each regular one — [AD, A, AD, B, AD, C] — so the ad shows
// as often as all the regular editorials combined. Tablets one position apart
// never collide; two apart can both be on the ad at once (it's on every other
// slot), which is the price of the ad running half the time.
//
// Position = order in STAGGER_ORDER (order the tablets went up; add new sets at
// the END). A tablet with no ?set= (door) is position 0.
const STAGGER_ORDER = ['set-a', 'set-c', 'set-b', 'set-d', 'concrete', 'vintage', 'cottage', 'studio-one', 'watering-hole', 'the-tank']
export const SLOT_MS = 35_000          // one editorial per slot
const MIN_PHOTO_MS = 5_000             // never flash a photo faster than this

const isAd = (e: ShowcaseEditorial) => !!(e.promoLabel || e.promoUrl)

export function buildPlaylist<T extends ShowcaseEditorial>(items: T[]): T[] {
  const ads = items.filter(isAd)
  const regular = items.filter(e => !isAd(e))
  if (!ads.length || !regular.length) return items.slice()
  const out: T[] = []
  let a = 0
  for (const r of regular) { out.push(ads[a++ % ads.length], r) }
  return out
}

export function tabletPosition(setSlug: string | null): number {
  return setSlug ? Math.max(0, STAGGER_ORDER.indexOf(setSlug)) : 0
}

// What this tablet shows at `now`: which editorial, which photo, and a key that
// changes exactly when the editorial does.
export function scheduleAt<T extends ShowcaseEditorial>(playlist: T[], setSlug: string | null, now: number) {
  if (!playlist.length) return null
  const slot = Math.floor(now / SLOT_MS)
  const idx = (slot + tabletPosition(setSlug)) % playlist.length
  const e = playlist[idx]
  const n = Math.max(1, e.photos.length)
  const shown = Math.max(1, Math.min(n, Math.floor(SLOT_MS / MIN_PHOTO_MS)))
  const photo = Math.min(shown - 1, Math.floor((now % SLOT_MS) / (SLOT_MS / shown)))
  return { e, photo, key: `${slot}:${idx}` }
}

// `footer` (2026-10-06): the NOW PLAYING bar + STAFF/MUSIC buttons stay on
// screen under the gallery — the showcase used to cover them whenever the set
// was empty. Taps on the footer do NOT dismiss the showcase.
export default function KioskShowcase({ items: raw, setSlug = null, onDismiss, portrait, footer }: { items: ShowcaseEditorial[]; setSlug?: string | null; onDismiss: () => void; portrait: boolean; footer?: ReactNode }) {
  const playlist = useMemo(() => buildPlaylist(raw), [raw])
  // Local 1s tick — zero network calls.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [])
  const at = scheduleAt(playlist, setSlug, now)
  if (!at) return null
  return <One key={at.key} e={at.e} i={at.photo} onDismiss={onDismiss} portrait={portrait} footer={footer} />
}

function One({ e, i, onDismiss, portrait, footer }: { e: ShowcaseEditorial; i: number; onDismiss: () => void; portrait: boolean; footer?: ReactNode }) {
  const n = e.photos.length

  // A promo QR (e.g. The Patient → /submissions) takes precedence over the post.
  // Relative links become absolute: a phone scanning it isn't on this site.
  const qrTarget = e.promoUrl ? (e.promoUrl.startsWith('/') ? `https://madekulture.com${e.promoUrl}` : e.promoUrl) : e.postUrl
  const promo = !!(e.promoLabel || e.promoUrl)
  const qr = useMemo(() => {
    if (!qrTarget) return null
    const q = qrcode(0, 'M'); q.addData(qrTarget); q.make()
    const size = q.getModuleCount()
    let d = ''
    for (let r = 0; r < size; r++) for (let c = 0; c < size; c++) if (q.isDark(r, c)) d += `M${c},${r}h1v1h-1z`
    return { n: size, d }
  }, [qrTarget])

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
        <div style={{ fontSize: 14, fontWeight: 700, letterSpacing: '0.32em', color: promo ? CHAMP : CHAMP_DIM }}>
          {e.promoLabel ? e.promoLabel.toUpperCase() : `FEATURED EDITORIAL${e.setName ? ` · ${e.setName.toUpperCase()}` : ''}`}
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
          <div style={{ background: '#fff', padding: 8, borderRadius: 8, width: promo ? (portrait ? 144 : 160) : (portrait ? 112 : 128) }}>
            <svg viewBox={`0 0 ${qr.n} ${qr.n}`} style={{ display: 'block', width: '100%', height: 'auto' }} shapeRendering="crispEdges">
              <path d={qr.d} fill="#0b0b0d" />
            </svg>
          </div>
          <div style={{ fontSize: promo ? 12 : 10, fontWeight: promo ? 700 : 400, letterSpacing: '0.22em', color: promo ? CHAMP : CHAMP_DIM, marginTop: 8 }}>{(e.promoCta || 'SEE THE POST').toUpperCase()}</div>
        </div>
      )}
    </div>
  )

  // AD LAYOUT (2026-10-08, Teddy): an editorial used as an ad must READ as an
  // ad from across the room, so the photo goes full bleed and a huge headline
  // sits over its lower half (darkened so white text holds over anything).
  if (promo) {
    const headline = (e.promoHeadline || e.title || '').toUpperCase()
    const byline = credits.filter(c => c.handle).map(c => `${c.role ? c.role + ' ' : ''}@${c.handle}`).join('  ·  ')
    return (
      <div onClick={onDismiss} role="button" aria-label="Tap to return"
        style={{ position: 'fixed', inset: 0, zIndex: 50, background: '#050505', color: '#fff', fontFamily: 'Inter, sans-serif',
                 display: 'flex', flexDirection: 'column', cursor: 'pointer', userSelect: 'none' }}>
        <div style={{ position: 'relative', flex: 1, minHeight: 0, overflow: 'hidden' }}>
          {e.photos.map((src, k) => (
            <img key={src} src={src} alt="" draggable={false}
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center top',
                       opacity: k === i ? 1 : 0, transition: 'opacity 1.6s ease' }} />
          ))}
          <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none',
            background: portrait
              ? 'linear-gradient(to bottom, rgba(5,5,5,0) 30%, rgba(5,5,5,0.55) 52%, rgba(5,5,5,0.92) 72%, #050505 100%)'
              : 'linear-gradient(to right, #050505 0%, rgba(5,5,5,0.9) 34%, rgba(5,5,5,0.35) 62%, rgba(5,5,5,0) 80%)' }} />
          <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, ...(portrait ? { padding: '0 44px 40px' } : { top: 0, right: '38%', padding: '48px 56px', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }) }}>
            <div style={{ fontSize: portrait ? 18 : 17, fontWeight: 700, letterSpacing: '0.32em', color: CHAMP }}>
              {(e.promoLabel || 'OPEN CALL').toUpperCase()}
            </div>
            <div style={{ fontFamily: 'Anton, "Bebas Neue", Inter, sans-serif', fontSize: portrait ? 112 : 104, lineHeight: 0.92, marginTop: 16,
                          color: '#fff', whiteSpace: 'pre-line', letterSpacing: '0.005em', textShadow: '0 4px 30px rgba(0,0,0,0.45)' }}>
              {headline}
            </div>
            {e.promoText && (
              <div style={{ fontSize: portrait ? 23 : 21, lineHeight: 1.45, color: 'rgba(255,255,255,0.82)', marginTop: 22, maxWidth: 640 }}>{e.promoText}</div>
            )}
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: 28, marginTop: 28 }}>
              <div style={{ flex: 1, minWidth: 0, fontSize: 14, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.5)' }}>
                {byline}
              </div>
              {qr && (
                <div style={{ flexShrink: 0, textAlign: 'center' }}>
                  <div style={{ background: '#fff', padding: 10, borderRadius: 10, width: portrait ? 176 : 168 }}>
                    <svg viewBox={`0 0 ${qr.n} ${qr.n}`} style={{ display: 'block', width: '100%', height: 'auto' }} shapeRendering="crispEdges">
                      <path d={qr.d} fill="#0b0b0d" />
                    </svg>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.22em', color: CHAMP, marginTop: 10 }}>{(e.promoCta || 'SCAN ME').toUpperCase()}</div>
                </div>
              )}
            </div>
          </div>
        </div>
        {footer && <div onClick={ev => ev.stopPropagation()} style={{ flexShrink: 0, cursor: 'default' }}>{footer}</div>}
      </div>
    )
  }

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
