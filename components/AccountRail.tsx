'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Account area navigation, Instagram-style.
//   Desktop: a slim icon rail on the far left that slides out (labels + full
//            wordmark) while hovered, floating over the page.
//   Phones:  a slim top bar + a bottom icon bar, with the rest under "More".
// Replaces the old AccountNav sidebar + AccountMenu overlay.

type Item = { href: string; label: string; icon: string }
const ITEMS: Item[] = [
  { href: '/account', label: 'Dashboard', icon: 'home' },
  { href: '/account/bookings', label: 'My Bookings', icon: 'cal' },
  { href: '/account/plus', label: 'Membership', icon: 'star' },
  { href: '/account/directory', label: 'Directory', icon: 'search' },
  { href: '/account/castings', label: 'Castings', icon: 'cast' },
  { href: '/account/messages', label: 'Messages', icon: 'msg' },
  { href: '/account/profile', label: 'Profile', icon: 'user' },
  { href: '/account/security', label: 'Login & Security', icon: 'lock' },
  { href: '/account/payment', label: 'Payment Methods', icon: 'card' },
]
const MOBILE_BAR = ['/account', '/account/directory', '/account/castings', '/account/messages', '/account/profile']

const PATHS: Record<string, React.ReactNode> = {
  home: <path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  cal: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  cast: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
  msg: <><path d="M22 3 2 10l8 3 3 8z" /><path d="m10 13 5-5" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  card: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  out: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  site: <><path d="M15 3h6v6M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
  more: <><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></>,
}
const Icon = ({ name, active }: { name: string; active?: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.6 : 1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>{PATHS[name]}</svg>
)

const THEME_KEY = 'mk-acct-theme'

export default function AccountRail() {
  const pathname = usePathname() || ''
  const [unread, setUnread] = useState(0)
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [moreOpen, setMoreOpen] = useState(false)

  useEffect(() => {
    fetch('/api/messages/unread').then(r => (r.ok ? r.json() : { unread: 0 })).then(d => setUnread(d.unread ?? 0)).catch(() => {})
    setMoreOpen(false)
  }, [pathname])
  useEffect(() => { setTheme(document.documentElement.dataset.acctTheme === 'light' ? 'light' : 'dark') }, [])
  // Make member photos harder to save: no right-click "Save image as", no
  // dragging to the desktop. (Screenshots can't be stopped; this removes the
  // one-click grab.) Scoped to the account area's images.
  useEffect(() => {
    const block = (e: Event) => {
      const t = e.target as HTMLElement | null
      if (t?.tagName === 'IMG' && t.closest('.acct-theme')) e.preventDefault()
    }
    document.addEventListener('contextmenu', block)
    document.addEventListener('dragstart', block)
    return () => { document.removeEventListener('contextmenu', block); document.removeEventListener('dragstart', block) }
  }, [])
  // Lift the June button above the phone bottom bar.
  useEffect(() => {
    const root = document.documentElement
    const mq = window.matchMedia('(max-width: 768px)')
    const set = () => root.style.setProperty('--mk-acctbar-h', mq.matches ? '62px' : '0px')
    set(); mq.addEventListener('change', set)
    return () => { mq.removeEventListener('change', set); root.style.setProperty('--mk-acctbar-h', '0px') }
  }, [])

  const flipTheme = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    document.documentElement.dataset.acctTheme = next
    try { localStorage.setItem(THEME_KEY, next) } catch {}
    setTheme(next)
  }
  const isActive = (href: string) => href === '/account' ? pathname === '/account' : pathname === href || pathname.startsWith(href + '/')
  const badge = (href: string) => href === '/account/messages' && unread > 0

  return (
    <>
      <style>{`
        .ar { position: fixed; left: 0; top: 0; bottom: 0; width: 72px; z-index: 60; background: var(--t-bg); border-right: 1px solid rgba(var(--t-fg-rgb), calc(0.1 * var(--t-a))); display: flex; flex-direction: column; padding: 20px 12px; box-sizing: border-box; overflow: hidden; transition: width .18s ease, box-shadow .18s ease; }
        .ar:hover, .ar:has(:focus-visible) { width: 244px; box-shadow: 10px 0 30px rgba(0,0,0,.28); }
        .ar-logo { display: flex; align-items: center; height: 40px; padding-left: 7px; margin-bottom: 22px; text-decoration: none; color: var(--t-fg); font-family: Anton, 'Bebas Neue', sans-serif; font-size: 20px; letter-spacing: .04em; white-space: nowrap; }
        .ar-logo .full { display: none; } .ar:hover .ar-logo .full, .ar:has(:focus-visible) .ar-logo .full { display: inline; } .ar:hover .ar-logo .mk, .ar:has(:focus-visible) .ar-logo .mk { display: none; }
        .ar-nav { display: flex; flex-direction: column; gap: 2px; flex: 1; }
        .ar-it { position: relative; display: flex; align-items: center; gap: 16px; padding: 11px 12px; border-radius: 9px; color: var(--t-fg); text-decoration: none; font-family: Inter; font-size: 15px; white-space: nowrap; background: none; border: none; cursor: pointer; width: 100%; text-align: left; }
        .ar-it:hover { background: rgba(var(--t-fg-rgb), calc(0.07 * var(--t-a))); }
        .ar-it.on { font-weight: 700; }
        .ar-it .lbl { opacity: 0; transition: opacity .12s ease; }
        .ar:hover .ar-it .lbl, .ar:has(:focus-visible) .ar-it .lbl { opacity: 1; }
        .ar-dot { position: absolute; left: 30px; top: 8px; min-width: 16px; height: 16px; border-radius: 8px; background: var(--t-gold); color: var(--t-on-fg); font-size: 9.5px; font-weight: 700; display: flex; align-items: center; justify-content: center; padding: 0 4px; font-family: Inter; }
        .ar-bot { display: flex; flex-direction: column; gap: 2px; }
        .am-top, .am-bar, .am-sheet { display: none; }
        @media (max-width: 768px) {
          .ar { display: none; }
          .am-top { display: flex; position: sticky; top: 0; z-index: 60; height: 52px; align-items: center; justify-content: space-between; padding: 0 16px; background: var(--t-bg); border-bottom: 1px solid rgba(var(--t-fg-rgb), calc(0.1 * var(--t-a))); }
          .am-top a { font-family: Anton, 'Bebas Neue', sans-serif; font-size: 20px; letter-spacing: .04em; color: var(--t-fg); text-decoration: none; }
          .am-top button { background: none; border: none; color: var(--t-fg); padding: 6px; cursor: pointer; }
          .am-bar { display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 60; height: 62px; padding-bottom: env(safe-area-inset-bottom); background: var(--t-bg); border-top: 1px solid rgba(var(--t-fg-rgb), calc(0.1 * var(--t-a))); justify-content: space-around; align-items: center; }
          .am-bar a, .am-bar button { position: relative; color: var(--t-fg); background: none; border: none; padding: 10px; display: flex; cursor: pointer; }
          .am-bar .ar-dot { left: 26px; top: 4px; }
          .am-sheet { display: block; position: fixed; left: 0; right: 0; bottom: 62px; z-index: 61; background: var(--t-surface); border-top: 1px solid rgba(var(--t-fg-rgb), calc(0.12 * var(--t-a))); border-radius: 16px 16px 0 0; padding: 10px 10px 14px; box-shadow: 0 -10px 30px rgba(0,0,0,.3); }
          .am-scrim { position: fixed; inset: 0; bottom: 62px; z-index: 60; background: rgba(0,0,0,.35); }
        }
      `}</style>

      {/* Desktop rail */}
      <aside className="ar" aria-label="Account menu">
        <Link href="/" className="ar-logo" title="Made Kulture home"><span className="mk">MK</span><span className="full">MADE KULTURE</span></Link>
        <nav className="ar-nav">
          {ITEMS.map(it => (
            <Link key={it.href} href={it.href} className={`ar-it${isActive(it.href) ? ' on' : ''}`} title={it.label}>
              <Icon name={it.icon} active={isActive(it.href)} />
              {badge(it.href) && <span className="ar-dot">{unread > 9 ? '9+' : unread}</span>}
              <span className="lbl">{it.label}</span>
            </Link>
          ))}
        </nav>
        <div className="ar-bot">
          <Link href="/" className="ar-it" title="Back to the website"><Icon name="site" /><span className="lbl">Back to website</span></Link>
        </div>
      </aside>

      {/* Phone: top bar */}
      <div className="am-top">
        <Link href="/">MADE KULTURE</Link>
        <button type="button" onClick={flipTheme} aria-label={theme === 'light' ? 'Dark mode' : 'Light mode'}><Icon name={theme === 'light' ? 'moon' : 'sun'} /></button>
      </div>

      {/* Phone: bottom bar */}
      <nav className="am-bar" aria-label="Account menu">
        {MOBILE_BAR.map(href => {
          const it = ITEMS.find(i => i.href === href)!
          return (
            <Link key={href} href={href} aria-label={it.label}>
              <Icon name={it.icon} active={isActive(href)} />
              {badge(href) && <span className="ar-dot">{unread > 9 ? '9+' : unread}</span>}
            </Link>
          )
        })}
        <button type="button" aria-label="More" onClick={() => setMoreOpen(o => !o)}><Icon name="more" active={moreOpen} /></button>
      </nav>
      {moreOpen && (
        <>
          <div className="am-scrim" onClick={() => setMoreOpen(false)} />
          <div className="am-sheet">
            {ITEMS.filter(i => !MOBILE_BAR.includes(i.href)).map(it => (
              <Link key={it.href} href={it.href} className={`ar-it${isActive(it.href) ? ' on' : ''}`}><Icon name={it.icon} /><span>{it.label}</span></Link>
            ))}
            <Link href="/" className="ar-it"><Icon name="site" /><span>Back to website</span></Link>
            <form action="/api/auth/signout" method="POST" style={{ margin: 0 }}>
              <button type="submit" className="ar-it"><Icon name="out" /><span>Sign out</span></button>
            </form>
          </div>
        </>
      )}
    </>
  )
}

// Desktop top bar (restored): wordmark left, light/dark + SIGN OUT right —
// the same bar the account area had before the icon rail. Phones keep their
// own slim top bar inside AccountRail.
export function AccountTopBar() {
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  useEffect(() => { setTheme(document.documentElement.dataset.acctTheme === 'light' ? 'light' : 'dark') }, [])
  const flip = () => {
    const next = theme === 'light' ? 'dark' : 'light'
    document.documentElement.dataset.acctTheme = next
    try { localStorage.setItem(THEME_KEY, next) } catch {}
    setTheme(next)
  }
  const box: React.CSSProperties = { background: 'none', border: '1px solid rgba(var(--t-fg-rgb), calc(0.15 * var(--t-a)))', borderRadius: 4, color: 'var(--t-fg)', cursor: 'pointer' }
  return (
    <div className="at-top">
      <style>{`
        .at-top { position: sticky; top: 0; z-index: 50; height: 60px; display: flex; align-items: center; justify-content: space-between; padding: 0 48px; background: var(--t-bg); border-bottom: 1px solid rgba(var(--t-fg-rgb), calc(0.08 * var(--t-a))); }
        @media (max-width: 768px) { .at-top { display: none; } }
      `}</style>
      <Link href="/" style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 20, letterSpacing: '0.05em', color: 'var(--t-fg)', textDecoration: 'none' }}>MADE KULTURE</Link>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" onClick={flip} aria-label={theme === 'light' ? 'Dark mode' : 'Light mode'} title={theme === 'light' ? 'Dark mode' : 'Light mode'}
          style={{ ...box, width: 36, height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{PATHS[theme === 'light' ? 'moon' : 'sun']}</svg>
        </button>
        <form action="/api/auth/signout" method="POST" style={{ margin: 0 }}>
          <button type="submit" style={{ ...box, padding: '8px 16px', fontFamily: 'Inter', fontSize: 12, letterSpacing: '0.08em' }}>SIGN OUT</button>
        </form>
      </div>
    </div>
  )
}
