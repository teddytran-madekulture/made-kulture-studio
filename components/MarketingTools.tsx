'use client'
// Public side of Marketing Tools (lib/marketing-tools.ts, edited at
// /admin/website/marketing):
//   <AnnouncementBar/>    — rendered by SiteNav, a strip ABOVE the fixed nav.
//                            Sets --mk-announce-h so the nav sits below it.
//   <MarketingOverlays/>  — rendered once in app/layout.tsx: the pop-up, and the
//                            phone-only bottom info bar (sets --mk-mobilebar-h so
//                            June's chat button moves up out of its way).
// All three hide on staff pages and mid-checkout (hiddenOnPath).
// ⚠️ Browser storage is best-effort only (private windows throw) — every access
// is wrapped, and the worst case is a pop-up showing twice.
import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { THEMES, hiddenOnPath, type ActiveMarketing } from '@/lib/marketing-tools'

let cache: Promise<ActiveMarketing | null> | null = null
function loadMarketing(): Promise<ActiveMarketing | null> {
  if (!cache) cache = fetch('/api/site/marketing').then(r => (r.ok ? r.json() : null)).catch(() => null)
  return cache
}
function useMarketing() {
  const [m, setM] = useState<ActiveMarketing | null>(null)
  useEffect(() => { let live = true; loadMarketing().then(d => { if (live) setM(d) }); return () => { live = false } }, [])
  return m
}
const store = {
  get(kind: 'local' | 'session', k: string) { try { return (kind === 'local' ? localStorage : sessionStorage).getItem(k) } catch { return null } },
  set(kind: 'local' | 'session', k: string, v: string) { try { (kind === 'local' ? localStorage : sessionStorage).setItem(k, v) } catch {} },
}
const setVar = (name: string, v: string) => { try { document.documentElement.style.setProperty(name, v) } catch {} }

function Linkish({ href, children, style, onClick }: { href: string; children: React.ReactNode; style: React.CSSProperties; onClick?: () => void }) {
  const external = /^https?:\/\//i.test(href)
  return <a href={href} onClick={onClick} style={style} {...(external ? { target: '_blank', rel: 'noreferrer' } : {})}>{children}</a>
}

// ── Announcement bar ─────────────────────────────────────────────────────────
export function AnnouncementBar() {
  const m = useMarketing()
  const pathname = usePathname()
  const ref = useRef<HTMLDivElement>(null)
  const a = m?.announcement
  const key = a ? `mk_announce_closed:${a.text}` : ''
  const [closed, setClosed] = useState(false)
  useEffect(() => { if (key) setClosed(store.get('session', key) === '1') }, [key])
  const show = !!a && !closed && !hiddenOnPath(pathname)

  useEffect(() => {
    if (!show || !ref.current) { setVar('--mk-announce-h', '0px'); return }
    const el = ref.current
    const update = () => setVar('--mk-announce-h', `${el.offsetHeight}px`)
    update()
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    ro?.observe(el)
    return () => { ro?.disconnect(); setVar('--mk-announce-h', '0px') }
  }, [show])

  if (!show || !a) return null
  const t = THEMES[a.theme] ?? THEMES.gold
  return (
    <div ref={ref} role="region" aria-label="Announcement" style={{
      position: 'fixed', top: 0, left: 0, right: 0, zIndex: 101, background: t.bg, color: t.fg,
      padding: '9px 44px', textAlign: 'center', fontFamily: 'Inter, sans-serif', fontSize: 13, lineHeight: 1.4, fontWeight: 500,
    }}>
      {a.text}
      {a.linkLabel && a.linkUrl && (
        <>{' '}<Linkish href={a.linkUrl} style={{ color: t.link, fontWeight: 700, textDecoration: 'underline', textUnderlineOffset: 3, whiteSpace: 'nowrap' }}>{a.linkLabel} →</Linkish></>
      )}
      <button aria-label="Close announcement" onClick={() => { store.set('session', key, '1'); setClosed(true) }}
        style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: t.fg, fontSize: 18, lineHeight: 1, cursor: 'pointer', opacity: 0.7, padding: 6 }}>×</button>
    </div>
  )
}

// ── The pop-up card: "The Cover" (2026-09-30) ───────────────────────────────
// A photo fills the card and the words sit over its lower part on a SOFT shade —
// deliberately lighter than the rest of the site (Teddy: "our site is already
// dark"), so the photo stays bright and the pop-up reads as something new.
// No photo ⇒ same layout on a warm dark gradient. Exported so the editor's
// preview is this exact component, not a look-alike that can drift.
export type PopupCardData = {
  headline: string; body: string; buttonLabel: string; buttonUrl: string
  eyebrow?: string; imageUrl?: string; focal?: 'top' | 'center' | 'bottom'
  link2Label?: string; link2Url?: string
  hl1Title?: string; hl1Text?: string; hl2Title?: string; hl2Text?: string
}
const FOCAL: Record<string, string> = { top: 'center 20%', center: 'center 40%', bottom: 'center 75%' }

export function PopupCard({ p, onClose, narrow }: { p: PopupCardData; onClose?: () => void; narrow?: boolean }) {
  const hasImg = !!p.imageUrl
  const hls = [[p.hl1Title, p.hl1Text], [p.hl2Title, p.hl2Text]].filter(([t, x]) => t || x) as [string, string][]
  const mono = '"JetBrains Mono", ui-monospace, monospace'
  return (
    <div style={{
      position: 'relative', width: '100%', minHeight: hasImg ? (narrow ? 480 : 540) : 0, color: '#fff', overflow: 'hidden',
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', gap: 12, padding: narrow ? '26px 22px 24px' : '30px 30px 28px',
      paddingTop: hasImg ? (narrow ? 180 : 220) : (narrow ? 34 : 40),
      background: hasImg
        ? `linear-gradient(to top, rgba(20,12,12,0.88) 0%, rgba(20,12,12,0.58) 34%, rgba(20,12,12,0) 64%), url("${p.imageUrl}") ${FOCAL[p.focal || 'center']}/cover`
        : 'linear-gradient(160deg, #1d1512 0%, #0f0d0c 60%)',
      border: hasImg ? 'none' : '1px solid rgba(212,168,67,0.3)', boxShadow: '0 30px 90px rgba(0,0,0,0.55)',
    }}>
      {onClose && (
        <button aria-label="Close" onClick={onClose} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', color: '#fff', textShadow: '0 1px 8px rgba(0,0,0,0.6)', fontSize: 26, cursor: 'pointer', padding: 6, lineHeight: 1 }}>×</button>
      )}
      {p.eyebrow && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, fontFamily: mono, fontSize: 11, letterSpacing: '0.28em', textTransform: 'uppercase', color: '#f0c96a' }}>
          <span style={{ width: 36, height: 1, background: 'rgba(255,255,255,0.6)' }} />{p.eyebrow}
        </div>
      )}
      {p.headline && (
        <h2 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontWeight: 400, fontSize: narrow ? 42 : 'clamp(40px, 7vw, 62px)', lineHeight: 0.92, letterSpacing: '0.01em', margin: 0, textTransform: 'uppercase', whiteSpace: 'pre-line', textShadow: hasImg ? '0 2px 24px rgba(0,0,0,0.35)' : undefined }}>{p.headline}</h2>
      )}
      {p.body && <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14.5, lineHeight: 1.6, color: 'rgba(255,255,255,0.88)', margin: 0, whiteSpace: 'pre-wrap' }}>{p.body}</p>}
      {hls.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: narrow || hls.length === 1 ? '1fr' : '1fr 1fr', gap: 16, borderTop: '1px solid rgba(255,255,255,0.28)', paddingTop: 14 }}>
          {hls.map(([t, x], k) => (
            <div key={k}>
              {t && <div style={{ fontFamily: 'Inter, sans-serif', fontWeight: 700, fontSize: 11, letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 4, color: k === 1 ? '#f0c96a' : '#fff' }}>{t}</div>}
              {x && <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, lineHeight: 1.5, color: 'rgba(255,255,255,0.85)' }}>{x}</div>}
            </div>
          ))}
        </div>
      )}
      {((p.buttonLabel && p.buttonUrl) || (p.link2Label && p.link2Url)) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, flexWrap: 'wrap', marginTop: 6 }}>
          {p.buttonLabel && p.buttonUrl && (
            <Linkish href={p.buttonUrl} onClick={onClose} style={{ background: '#d4a843', color: '#080808', textDecoration: 'none', padding: '14px 22px', fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.16em', textTransform: 'uppercase' }}>{p.buttonLabel} ↗</Linkish>
          )}
          {p.link2Label && p.link2Url && (
            <Linkish href={p.link2Url} onClick={onClose} style={{ color: '#fff', textDecoration: 'none', borderBottom: '1px solid rgba(255,255,255,0.5)', paddingBottom: 3, fontFamily: mono, fontSize: 11, letterSpacing: '0.2em', textTransform: 'uppercase' }}>{p.link2Label} →</Linkish>
          )}
        </div>
      )}
    </div>
  )
}

// ── Pop-up + mobile info bar ─────────────────────────────────────────────────
export function MarketingOverlays() {
  const m = useMarketing()
  const pathname = usePathname()
  const hidden = hiddenOnPath(pathname)

  // Pop-up
  const p = m?.popup
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!p || hidden) { setOpen(false); return }
    if (p.pages === 'home' && pathname !== '/') return
    const key = `mk_popup_seen:${p.version}`
    if (p.frequency === 'once' && store.get('local', key)) return
    if (p.frequency === 'session' && store.get('session', key)) return
    const t = setTimeout(() => setOpen(true), p.delaySec * 1000)
    return () => clearTimeout(t)
  }, [p, hidden, pathname])
  const closePopup = () => {
    if (p) { const key = `mk_popup_seen:${p.version}`; store.set('local', key, '1'); store.set('session', key, '1') }
    setOpen(false)
  }
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closePopup() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  // Mobile info bar (phones only)
  const b = m?.mobileBar
  const barRef = useRef<HTMLDivElement>(null)
  const [phone, setPhone] = useState(false)
  const [barClosed, setBarClosed] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const u = () => setPhone(mq.matches); u()
    mq.addEventListener('change', u); return () => mq.removeEventListener('change', u)
  }, [])
  useEffect(() => { if (b) setBarClosed(store.get('session', `mk_mbar_closed:${b.version}`) === '1') }, [b])
  const showBar = !!b && phone && !barClosed && !hidden
  useEffect(() => {
    if (!showBar || !barRef.current) { setVar('--mk-mobilebar-h', '0px'); return }
    setVar('--mk-mobilebar-h', `${barRef.current.offsetHeight}px`)
    return () => setVar('--mk-mobilebar-h', '0px')
  }, [showBar])

  return (
    <>
      {open && p && !hidden && (
        <div role="dialog" aria-modal="true" aria-label={p.headline || 'Announcement'} onClick={closePopup} style={{
          position: 'fixed', inset: 0, zIndex: 9500, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 'min(640px, 100%)', maxHeight: 'calc(100% - 32px)', overflowY: 'auto' }}>
            <PopupCard p={p} onClose={closePopup} narrow={phone} />
          </div>
        </div>
      )}

      {showBar && b && (
        <div ref={barRef} role="region" aria-label="Info" style={{
          position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 8990, background: '#080808', borderTop: '1px solid rgba(212,168,67,0.4)',
          display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px calc(10px + env(safe-area-inset-bottom))',
        }}>
          <span style={{ flex: 1, minWidth: 0, fontFamily: 'Inter, sans-serif', fontSize: 13, lineHeight: 1.35, color: '#fff' }}>{b.text}</span>
          {b.buttonLabel && b.buttonUrl && (
            <Linkish href={b.buttonUrl} style={{ flexShrink: 0, background: '#d4a843', color: '#080808', textDecoration: 'none', padding: '9px 12px', fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>{b.buttonLabel}</Linkish>
          )}
          <button aria-label="Close" onClick={() => { store.set('session', `mk_mbar_closed:${b.version}`, '1'); setBarClosed(true) }}
            style={{ flexShrink: 0, background: 'none', border: 'none', color: 'rgba(255,255,255,0.55)', fontSize: 20, padding: 4, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>
      )}
    </>
  )
}
