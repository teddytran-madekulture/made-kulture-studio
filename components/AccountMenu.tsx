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

// Mobile-only: hamburger in the top bar that opens a full-screen overlay
// menu, matching the homepage nav. Renders nothing on desktop.
export default function AccountMenu() {
  const isMobile = useIsMobile()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  if (!isMobile) return null

  return (
    <>
      <button onClick={() => setOpen(true)} aria-label="Menu" style={{ background: 'transparent', border: 'none', color: '#fff', fontSize: 26, lineHeight: 1, cursor: 'pointer', padding: 4 }}>☰</button>

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
            <form action="/api/auth/signout" method="POST" style={{ margin: 0 }}>
              <button type="submit" style={{
                background: 'transparent', border: 'none', padding: '4px 0', cursor: 'pointer', textAlign: 'left',
                fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(32px, 9vw, 52px)', letterSpacing: '0.02em', lineHeight: 1.12,
                color: 'rgba(255,255,255,0.5)',
              }}>SIGN OUT</button>
            </form>
          </div>

          <div style={{ marginTop: 'auto', paddingTop: 28, borderTop: '1px solid rgba(255,255,255,0.1)' }}>
            <Link href="/" onClick={() => setOpen(false)} style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 12, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.55)', textDecoration: 'none' }}>← BACK TO SITE</Link>
          </div>
        </div>
      )}
    </>
  )
}
