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
          <div onClick={e => e.stopPropagation()} style={{
            position: 'relative', width: 'min(460px, 100%)', background: '#0d0d0d', border: '1px solid rgba(212,168,67,0.35)',
            padding: '36px 28px 28px', color: '#fff', boxShadow: '0 20px 60px rgba(0,0,0,0.6)', maxHeight: 'calc(100% - 32px)', overflowY: 'auto',
          }}>
            <button aria-label="Close" onClick={closePopup} style={{ position: 'absolute', top: 8, right: 10, background: 'none', border: 'none', color: 'rgba(255,255,255,0.6)', fontSize: 24, cursor: 'pointer', padding: 6, lineHeight: 1 }}>×</button>
            <div style={{ width: 28, height: 2, background: '#d4a843', marginBottom: 16 }} />
            {p.headline && <h2 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, lineHeight: 1.05, letterSpacing: '0.01em', margin: '0 0 14px', fontWeight: 400 }}>{p.headline}</h2>}
            {p.body && <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 15, lineHeight: 1.6, color: 'rgba(255,255,255,0.8)', margin: 0, whiteSpace: 'pre-wrap' }}>{p.body}</p>}
            {p.buttonLabel && p.buttonUrl && (
              <Linkish href={p.buttonUrl} onClick={closePopup} style={{
                display: 'block', marginTop: 24, background: '#d4a843', color: '#080808', textAlign: 'center', textDecoration: 'none',
                padding: '14px 18px', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase',
              }}>{p.buttonLabel}</Linkish>
            )}
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
