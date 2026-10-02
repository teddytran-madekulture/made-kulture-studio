'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import NavAuthLink from '@/components/NavAuthLink'
import { AnnouncementBar } from '@/components/MarketingTools'
import { useIsMobile } from '@/lib/use-is-mobile'
import { createClient } from '@/lib/supabase/client'

const LINKS: { label: string; href: string }[] = [
  { label: 'HOME',          href: '/' },
  { label: 'SETS',          href: '/sets' },
  { label: 'GEAR',          href: '/gear' },
  { label: 'PROPS',         href: '/props' },
  { label: 'STUDIO RULES',  href: '/studio-rules' },
  { label: 'AVAILABILITY',  href: '/availability' },
  { label: 'MEMBERSHIP',    href: '/plus' },
]

// Shared site navigation: transparent at the top, solid on scroll, with a
// full-screen bold menu on mobile. `active` highlights the current page.
export default function SiteNav({ active }: { active?: string }) {
  // Compact/hamburger nav below 1280px so the full desktop row (logo + 7 links +
  // login/signup + DIRECTORY + book) never has to cram or overlap. Was 1180
  // before the DIRECTORY button joined the right side (2026-10-02).
  const isMobile = useIsMobile(1280)
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [authed, setAuthed] = useState<boolean | null>(null)

  useEffect(() => {
    const supabase = createClient()
    supabase.auth.getUser().then(({ data: { user } }) => setAuthed(!!user))
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_, s) => setAuthed(!!s?.user))
    return () => subscription.unsubscribe()
  }, [])

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const isActive = (label: string) => active && label.toLowerCase() === active.toLowerCase()

  return (
    <>
      {/* Marketing Tools announcement strip (edited in the Website Editor). It sets
          --mk-announce-h to its own height so the nav sits just below it. */}
      <AnnouncementBar />
      <nav style={{
        position: 'fixed', top: 'var(--mk-announce-h, 0px)', left: 0, right: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: isMobile ? '16px 20px' : '20px 40px',
        background: (scrolled || (isMobile && menuOpen)) ? '#080808' : 'transparent',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent',
        transition: 'background 0.3s ease, border-color 0.3s ease, padding 0.3s ease',
      }}>
        {/* Readability scrim at the top of the page: a soft dark fade behind the
            nav so links stay legible over bright hero images. Fades out once the
            solid scrolled background takes over. */}
        <div aria-hidden style={{
          position: 'absolute', left: 0, right: 0, top: 0, height: '230%',
          background: 'linear-gradient(to bottom, rgba(8,8,8,0.8) 0%, rgba(8,8,8,0.45) 45%, rgba(8,8,8,0) 100%)',
          opacity: (scrolled || (isMobile && menuOpen)) ? 0 : 1,
          transition: 'opacity 0.3s ease', pointerEvents: 'none', zIndex: -1,
        }} />
        {/* Logo and right actions get EQUAL flex columns on desktop so the link
            group sits at the true page centre, not the centre of the leftover gap
            (the right side is much wider than the logo). */}
        <Link href="/" style={{ textDecoration: 'none', ...(isMobile ? {} : { flex: '1 1 0', minWidth: 'max-content' }) }}>
          <div style={{ width: 'max-content', fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 22, letterSpacing: '0.04em', color: '#fff', lineHeight: 1 }}>
            MADE<br />KULTURE
          </div>
        </Link>

        {isMobile ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {!menuOpen && authed === false && (
              <Link href="/signup" style={{
                color: '#fff', textDecoration: 'none',
                fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', whiteSpace: 'nowrap',
              }}>SIGN UP</Link>
            )}
            {!menuOpen && (
              <Link href="/book" style={{
                background: '#fff', color: '#080808', padding: '11px 18px', textDecoration: 'none',
                fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', whiteSpace: 'nowrap',
              }}>BOOK NOW</Link>
            )}
            <button onClick={() => setMenuOpen(o => !o)} aria-label="Menu"
              style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 34, lineHeight: 1, cursor: 'pointer', padding: 4, zIndex: 101 }}>
              {menuOpen ? '✕' : '☰'}
            </button>
          </div>
        ) : (
          <>
            {/* Centered nav links — in-flow between two equal-width sides, so they reserve
                their own space and can't overlap the logo or the right actions. */}
            <div style={{ flex: '0 0 auto', display: 'flex', justifyContent: 'center', gap: 30, alignItems: 'center', padding: '0 24px' }}>
              {LINKS.map(l => (
                <Link key={l.label} href={l.href}
                  style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', color: isActive(l.label) ? '#fff' : 'rgba(255,255,255,0.6)', textDecoration: 'none', transition: 'color 0.2s', whiteSpace: 'nowrap' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                  onMouseLeave={e => (e.currentTarget.style.color = isActive(l.label) ? '#fff' : 'rgba(255,255,255,0.6)')}
                >{l.label}</Link>
              ))}
            </div>
            {/* Right-side actions */}
            <div style={{ flex: '1 1 0', minWidth: 'max-content', display: 'flex', justifyContent: 'flex-end', gap: 24, alignItems: 'center' }}>
              <NavAuthLink />
              {/* THE DIRECTORY (2026-10-02): deliberately NOT one of the centre
                  links — those are the studio. Gold outline = the network, white
                  fill (BOOK NOW) = the studio, so the two never read as one. */}
              <Link href="/directory" style={{
                display: 'inline-flex', alignItems: 'center', gap: 10,
                background: isActive('directory') ? 'rgba(201,178,126,0.16)' : 'transparent',
                color: '#c9b27e', border: '1px solid rgba(201,178,126,0.7)', padding: '9px 16px', textDecoration: 'none',
                fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, fontWeight: 500, letterSpacing: '0.2em', whiteSpace: 'nowrap',
                transition: 'background 0.2s ease',
              }}
                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(201,178,126,0.16)')}
                onMouseLeave={e => (e.currentTarget.style.background = isActive('directory') ? 'rgba(201,178,126,0.16)' : 'transparent')}
              >
                <svg width="9" height="9" viewBox="0 0 10 10" aria-hidden><path d="M5 0L10 5L5 10L0 5Z" fill="currentColor"/></svg>
                DIRECTORY
              </Link>
              <Link href="/book" style={{
                display: 'inline-flex', alignItems: 'center', gap: 16,
                background: '#fff', color: '#080808', padding: '10px 18px', textDecoration: 'none',
                fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, fontWeight: 500, letterSpacing: '0.2em',
              }}>
                BOOK NOW
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
              </Link>
            </div>
          </>
        )}
      </nav>

      {/* June's chat bubble (zIndex 9000) would float over the open menu's
          last rows on a short phone — hide it while the menu is open. */}
      {isMobile && menuOpen && <style>{'.mk-june-launcher{display:none !important}'}</style>}

      {/* Mobile full-screen menu */}
      {isMobile && menuOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99, background: '#080808', display: 'flex', flexDirection: 'column', padding: 'calc(88px + var(--mk-announce-h, 0px)) 24px 32px', overflowY: 'auto', WebkitOverflowScrolling: 'touch' as any }}>
          {[...LINKS, { label: 'BOOK', href: '/book' }].map(l => (
            <Link key={l.label} href={l.href} onClick={() => setMenuOpen(false)}
              style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(28px, min(9.5vw, 4.6vh), 64px)', letterSpacing: '0.02em', lineHeight: 1.04, color: isActive(l.label) ? '#fff' : 'rgba(255,255,255,0.85)', textDecoration: 'none', padding: '6px 0' }}>
              {l.label}
            </Link>
          ))}
          {/* THE DIRECTORY — set apart from the studio links, in gold */}
          <Link href="/directory" onClick={() => setMenuOpen(false)}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, margin: '12px 0 8px', padding: '12px 16px', border: '1px solid rgba(201,178,126,0.6)', background: isActive('directory') ? 'rgba(201,178,126,0.14)' : 'transparent', textDecoration: 'none' }}>
            <span style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(24px, min(7vw, 4vh), 40px)', letterSpacing: '0.02em', lineHeight: 1, color: '#c9b27e' }}>THE DIRECTORY</span>
              <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 10, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.5)' }}>HOUSTON&apos;S CREATIVE NETWORK</span>
            </span>
            <svg width="14" height="14" viewBox="0 0 10 10" aria-hidden style={{ color: '#c9b27e', flexShrink: 0 }}><path d="M5 0L10 5L5 10L0 5Z" fill="currentColor"/></svg>
          </Link>
          {authed === true && (
            <Link href="/account" onClick={() => setMenuOpen(false)}
              style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(28px, min(9.5vw, 4.6vh), 64px)', letterSpacing: '0.02em', lineHeight: 1.08, color: 'rgba(255,255,255,0.85)', textDecoration: 'none', padding: '6px 0' }}>
              ACCOUNT
            </Link>
          )}
          {authed === false && (
            <>
              <Link href="/login" onClick={() => setMenuOpen(false)}
                style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(28px, min(9.5vw, 4.6vh), 64px)', letterSpacing: '0.02em', lineHeight: 1.08, color: 'rgba(255,255,255,0.85)', textDecoration: 'none', padding: '6px 0' }}>
                LOG IN
              </Link>
              <Link href="/signup" onClick={() => setMenuOpen(false)}
                style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(28px, min(9.5vw, 4.6vh), 64px)', letterSpacing: '0.02em', lineHeight: 1.08, color: '#fff', textDecoration: 'none', padding: '6px 0' }}>
                SIGN UP
              </Link>
            </>
          )}
          <div style={{ marginTop: 'auto', paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="label" style={{ marginBottom: 6 }}>MADE KULTURE / HOUSTON</div>
            <div style={{ fontFamily: 'Inter Tight, Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>4825 Gulf Fwy, Houston TX · (832) 408-1631</div>
          </div>
        </div>
      )}
    </>
  )
}
