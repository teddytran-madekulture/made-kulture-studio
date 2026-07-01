'use client'
import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useIsMobile } from '@/lib/use-is-mobile'

const ITEMS = [
  { href: '/account', label: 'Dashboard' },
  { href: '/account/bookings', label: 'My Bookings' },
  { href: '/account/directory', label: 'Directory' },
  { href: '/account/profile', label: 'Profile' },
  { href: '/account/security', label: 'Login & Security' },
  { href: '/account/payment', label: 'Payment Methods' },
]

export default function AccountMenu() {
  const isMobile = useIsMobile()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)

  // Desktop: a simple sign-out button in the top bar.
  if (!isMobile) {
    return (
      <form action="/api/auth/signout" method="POST" style={{ margin: 0 }}>
        <button type="submit" style={{ background: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, padding: '8px 16px', fontFamily: 'Inter', fontSize: 12, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.5)', cursor: 'pointer' }}>
          SIGN OUT
        </button>
      </form>
    )
  }

  // Mobile: hamburger in the top bar + full-screen overlay menu.
  const invert = (e: any) => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#080808' }
  const revert = (e: any) => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#fff' }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
        <Link href="/" style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.6)', textDecoration: 'none', whiteSpace: 'nowrap' }}>← HOME</Link>
        <button onClick={() => setOpen(true)} aria-label="Menu" style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 26, lineHeight: 1, cursor: 'pointer', padding: 4 }}>☰</button>
      </div>

      {open && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: '#080808', display: 'flex', flexDirection: 'column', padding: '20px 24px 40px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 22, letterSpacing: '0.04em', color: '#fff', lineHeight: 1 }}>MADE<br />KULTURE</div>
            <button onClick={() => setOpen(false)} aria-label="Close" style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 26, lineHeight: 1, cursor: 'pointer', padding: 4 }}>✕</button>
          </div>

          <div style={{ marginTop: 44, display: 'flex', flexDirection: 'column' }}>
            <div style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.35)', marginBottom: 14 }}>ACCOUNT</div>
            {ITEMS.map(({ href, label }) => (
              <Link key={href} href={href} onClick={() => setOpen(false)} style={{
                fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(32px, 9vw, 52px)', letterSpacing: '0.02em', lineHeight: 1.12,
                color: href === pathname ? '#fff' : 'rgba(255,255,255,0.82)', textDecoration: 'none', padding: '4px 0',
              }}>{label}</Link>
            ))}
          </div>

          <div style={{ marginTop: 'auto' }}>
            <form action="/api/auth/signout" method="POST" style={{ margin: 0 }}>
              <button type="submit"
                onMouseDown={invert} onMouseUp={revert} onMouseLeave={revert} onTouchStart={invert} onTouchEnd={revert}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.25)', color: '#fff',
                  padding: '17px 22px', cursor: 'pointer',
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 13, fontWeight: 500, letterSpacing: '0.2em',
                }}>
                SIGN OUT
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" /></svg>
              </button>
            </form>
            <div style={{ marginTop: 20, paddingTop: 24, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
              <Link href="/" onClick={() => setOpen(false)} style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 12, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.55)', textDecoration: 'none' }}>← BACK TO SITE</Link>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
