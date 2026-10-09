'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { SETTINGS_PAGES } from '@/lib/settings-sections'
import { SHOOTS_PATHS } from '@/components/ShootsTabs'

// Account area navigation, Instagram-style.
//   Desktop: a slim icon rail on the far left that slides out (labels + full
//            wordmark) while hovered, floating over the page.
//   Phones:  a slim top bar + a bottom icon bar, with the rest under "More".
// Replaces the old AccountNav sidebar + AccountMenu overlay.

type Item = { href: string; label: string; icon: string }
const ITEMS: Item[] = [
  { href: '/account', label: 'Dashboard', icon: 'home' },
  // Shoots = My Bookings + Castings + Mini Sessions (tabs: components/ShootsTabs).
  { href: '/account/bookings', label: 'Shoots', icon: 'cal' },
  { href: '/account/directory', label: 'Directory', icon: 'search' },
  { href: '/account/messages', label: 'Messages', icon: 'msg' },
  { href: '/account/me', label: 'Profile', icon: 'user' },
]
// Membership, Login & Security, Payment Methods and the profile editor live
// under Settings (components/SettingsShell) — Instagram-style second menu.
const SETTINGS: Item = { href: '/account/profile', label: 'Settings', icon: 'gear' }
// 2026-10-07: Support Center (searchable FAQ + contact support tickets).
const SUPPORT: Item = { href: '/account/support', label: 'Help & Support', icon: 'help' }
const MOBILE_BAR = ['/account', '/account/directory', '/account/bookings', '/account/messages', '/account/me']

const PATHS: Record<string, React.ReactNode> = {
  home: <path d="M3 11 12 4l9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  cal: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></>,
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></>,
  cast: <><rect x="3" y="7" width="18" height="13" rx="2" /><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>,
  msg: <><path d="M22 3 2 10l8 3 3 8z" /><path d="m10 13 5-5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>,
  lock: <><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>,
  card: <><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>,
  moon: <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />,
  out: <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" />,
  site: <><path d="M15 3h6v6M10 14 21 3" /><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" /></>,
  gear: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6" /><path d="M12 17h.01" /></>,
  more: <><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></>,
}
const Icon = ({ name, active }: { name: string; active?: boolean }) => (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={active ? 2.6 : 1.8} strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>{PATHS[name]}</svg>
)

const THEME_KEY = 'mk-acct-theme'

export default function AccountRail() {
  const pathname = usePathname() || ''
  const [unread, setUnread] = useState(0)
  const [unseenApplicants, setUnseenApplicants] = useState(0)   // new applicants on MY castings (migration 142)
  const [theme, setTheme] = useState<'light' | 'dark'>('dark')
  const [moreOpen, setMoreOpen] = useState(false)
  const [myId, setMyId] = useState<string | null>(null)
  useEffect(() => {
    createClient().auth.getSession().then(({ data }) => setMyId(data.session?.user.id ?? null)).catch(() => {})
  }, [])

  useEffect(() => {
    fetch('/api/messages/unread').then(r => (r.ok ? r.json() : { unread: 0 })).then(d => setUnread(d.unread ?? 0)).catch(() => {})
    fetch('/api/castings/unseen').then(r => (r.ok ? r.json() : { unseen: 0 })).then(d => setUnseenApplicants(d.unseen ?? 0)).catch(() => {})
    setMoreOpen(false)
  }, [pathname])
  // Pages that clear something (e.g. opening my casting) fire 'mk-badges'.
  useEffect(() => {
    const refresh = () => {
      fetch('/api/castings/unseen').then(r => (r.ok ? r.json() : { unseen: 0 })).then(d => setUnseenApplicants(d.unseen ?? 0)).catch(() => {})
      fetch('/api/messages/unread').then(r => (r.ok ? r.json() : { unread: 0 })).then(d => setUnread(d.unread ?? 0)).catch(() => {})
    }
    window.addEventListener('mk-badges', refresh)
    return () => window.removeEventListener('mk-badges', refresh)
  }, [])
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
  const onOwnProfile = !!myId && pathname === `/account/directory/${myId}`
  const isActive = (href: string) => {
    if (href === '/account') return pathname === '/account'
    if (href === '/account/me') return pathname === '/account/me' || onOwnProfile
    if (href === SETTINGS.href) return SETTINGS_PAGES.includes(pathname)
    if (href === '/account/directory' && onOwnProfile) return false
    if (href === '/account/bookings') return SHOOTS_PATHS.some(p => pathname === p || pathname.startsWith(p + '/'))
    return pathname === href || pathname.startsWith(href + '/')
  }
  const countFor = (href: string) => href === '/account/messages' ? unread : href === '/account/bookings' ? unseenApplicants : 0
  const badge = (href: string) => countFor(href) > 0
  const badgeText = (href: string) => { const n = countFor(href); return n > 9 ? '9+' : String(n) }

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
        .ar-home { margin-bottom: 10px; }
        .ar-home::after { content: ''; position: absolute; left: 12px; right: 12px; bottom: -6px; height: 1px; background: rgba(var(--t-fg-rgb), calc(0.1 * var(--t-a))); }
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
        <Link href="/" className="ar-it ar-home" title="Made Kulture home"><Icon name="site" /><span className="lbl">Made Kulture home</span></Link>
        <nav className="ar-nav">
          {ITEMS.map(it => (
            <Link key={it.href} href={it.href} className={`ar-it${isActive(it.href) ? ' on' : ''}`} title={it.label}>
              <Icon name={it.icon} active={isActive(it.href)} />
              {badge(it.href) && <span className="ar-dot">{badgeText(it.href)}</span>}
              <span className="lbl">{it.label}</span>
            </Link>
          ))}
        </nav>
        <div className="ar-bot">
          <Link href={SUPPORT.href} className={`ar-it${isActive(SUPPORT.href) ? ' on' : ''}`} title={SUPPORT.label}>
            <Icon name="help" active={isActive(SUPPORT.href)} /><span className="lbl">{SUPPORT.label}</span>
          </Link>
          <Link href={SETTINGS.href} className={`ar-it${isActive(SETTINGS.href) ? ' on' : ''}`} title="Settings">
            <Icon name="gear" active={isActive(SETTINGS.href)} /><span className="lbl">Settings</span>
          </Link>
          <button type="button" className="ar-it" onClick={flipTheme} title={theme === 'light' ? 'Dark mode' : 'Light mode'}>
            <Icon name={theme === 'light' ? 'moon' : 'sun'} /><span className="lbl">{theme === 'light' ? 'Dark mode' : 'Light mode'}</span>
          </button>
          <form action="/api/auth/signout" method="POST" style={{ margin: 0 }}>
            <button type="submit" className="ar-it" title="Sign out"><Icon name="out" /><span className="lbl">Sign out</span></button>
          </form>
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
              {badge(href) && <span className="ar-dot">{badgeText(href)}</span>}
            </Link>
          )
        })}
        <button type="button" aria-label="More" onClick={() => setMoreOpen(o => !o)}><Icon name="more" active={moreOpen} /></button>
      </nav>
      {moreOpen && (
        <>
          <div className="am-scrim" onClick={() => setMoreOpen(false)} />
          <div className="am-sheet">
            {[...ITEMS.filter(i => !MOBILE_BAR.includes(i.href)), SUPPORT, SETTINGS].map(it => (
              <Link key={it.href} href={it.href} className={`ar-it${isActive(it.href) ? ' on' : ''}`}><Icon name={it.icon} /><span>{it.label}</span></Link>
            ))}
            <Link href="/" className="ar-it"><Icon name="site" /><span>Made Kulture home</span></Link>
            <form action="/api/auth/signout" method="POST" style={{ margin: 0 }}>
              <button type="submit" className="ar-it"><Icon name="out" /><span>Sign out</span></button>
            </form>
          </div>
        </>
      )}
    </>
  )
}

