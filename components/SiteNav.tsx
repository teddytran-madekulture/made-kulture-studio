'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import NavAuthLink from '@/components/NavAuthLink'
import { useIsMobile } from '@/lib/use-is-mobile'
import { createClient } from '@/lib/supabase/client'

const LINKS: { label: string; href: string }[] = [
  { label: 'HOME',          href: '/' },
  { label: 'SETS',          href: '/sets' },
  { label: 'GEAR',          href: '/gear' },
  { label: 'PROPS',         href: '/props' },
  { label: 'STUDIO RULES',  href: '/studio-rules' },
  { label: 'AVAILABILITY',  href: '/availability' },
]

// Shared site navigation: transparent at the top, solid on scroll, with a
// full-screen bold menu on mobile. `active` highlights the current page.
export default function SiteNav({ active }: { active?: string }) {
  const isMobile = useIsMobile()
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
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: isMobile ? '16px 20px' : '20px 40px',
        background: (scrolled || (isMobile && menuOpen)) ? '#080808' : 'transparent',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.08)' : '1px solid transparent',
        transition: 'background 0.3s ease, border-color 0.3s ease, padding 0.3s ease',
      }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 22, letterSpacing: '0.04em', color: '#fff', lineHeight: 1 }}>
            MADE<br />KULTURE
          </div>
        </Link>

        {isMobile ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {!menuOpen && (
              <Link href="/book" style={{
                background: '#fff', color: '#080808', padding: '11px 18px', textDecoration: 'none',
                fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', whiteSpace: 'nowrap',
              }}>BOOK NOW</Link>
            )}
            <button onClick={() => setMenuOpen(o => !o)} aria-label="Menu"
              style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 26, lineHeight: 1, cursor: 'pointer', padding: 4, zIndex: 101 }}>
              {menuOpen ? '✕' : '☰'}
            </button>
          </div>
        ) : (
          <>
            {/* Centered nav links */}
            <div style={{ position: 'absolute', left: '50%', top: '50%', transform: 'translate(-50%, -50%)', display: 'flex', gap: 36, alignItems: 'center' }}>
              {LINKS.map(l => (
                <Link key={l.label} href={l.href}
                  style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', color: isActive(l.label) ? '#fff' : 'rgba(255,255,255,0.6)', textDecoration: 'none', transition: 'color 0.2s' }}
                  onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
                  onMouseLeave={e => (e.currentTarget.style.color = isActive(l.label) ? '#fff' : 'rgba(255,255,255,0.6)')}
                >{l.label}</Link>
              ))}
            </div>
            {/* Right-side actions */}
            <div style={{ display: 'flex', gap: 24, alignItems: 'center' }}>
              <NavAuthLink />
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

      {/* Mobile full-screen menu */}
      {isMobile && menuOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 99, background: '#080808', display: 'flex', flexDirection: 'column', padding: '104px 24px 40px' }}>
          {[...LINKS, { label: 'BOOK', href: '/book' }].map(l => (
            <Link key={l.label} href={l.href} onClick={() => setMenuOpen(false)}
              style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(38px, 11vw, 64px)', letterSpacing: '0.02em', lineHeight: 1.08, color: isActive(l.label) ? '#fff' : 'rgba(255,255,255,0.85)', textDecoration: 'none', padding: '6px 0' }}>
              {l.label}
            </Link>
          ))}
          {authed !== null && (
            <Link href={authed ? '/account' : '/login'} onClick={() => setMenuOpen(false)}
              style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(38px, 11vw, 64px)', letterSpacing: '0.02em', lineHeight: 1.08, color: 'rgba(255,255,255,0.85)', textDecoration: 'none', padding: '6px 0' }}>
              {authed ? 'ACCOUNT' : 'LOG IN'}
            </Link>
          )}
          <div style={{ marginTop: 'auto', paddingTop: 32, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <div className="label" style={{ marginBottom: 6 }}>MADE KULTURE / HOUSTON</div>
            <div style={{ fontFamily: 'Inter Tight, Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>4825 Gulf Fwy, Houston TX · (832) 408-1631</div>
          </div>
        </div>
      )}
    </>
  )
}
