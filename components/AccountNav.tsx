'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useIsMobile } from '@/lib/use-is-mobile'

const ITEMS = [
  { href: '/account', label: 'Dashboard' },
  { href: '/account/bookings', label: 'My Bookings' },
  { href: '/account/plus', label: 'Membership' },
  { href: '/account/directory', label: 'Directory' },
  { href: '/account/castings', label: 'Castings' },
  { href: '/account/minis', label: 'Mini Sessions' },
  { href: '/account/messages', label: 'Messages' },
  { href: '/account/profile', label: 'Profile' },
  { href: '/account/security', label: 'Login & Security' },
  { href: '/account/payment', label: 'Payment Methods' },
]

// Desktop-only vertical sidebar. On mobile the nav lives in AccountMenu
// (a full-screen overlay), so this renders nothing.
export default function AccountNav() {
  const isMobile = useIsMobile()
  const pathname = usePathname()
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    fetch('/api/messages/unread')
      .then(r => (r.ok ? r.json() : { unread: 0 }))
      .then(d => setUnread(d.unread ?? 0))
      .catch(() => {})
  }, [pathname])

  if (isMobile) return null

  return (
    <nav className="acct-nav">
      <Link href="/" style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'Inter', fontSize: 13,
        color: 'rgba(var(--t-fg-rgb), calc(0.55 * var(--t-a)))', textDecoration: 'none', marginBottom: 24,
      }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--t-fg)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(var(--t-fg-rgb), calc(0.55 * var(--t-a)))')}
      >← Back to Home</Link>
      <div style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.1em', color: 'rgba(var(--t-fg-rgb), calc(0.3 * var(--t-a)))', marginBottom: 16 }}>ACCOUNT</div>
      {ITEMS.map(({ href, label }) => (
        <Link key={href} href={href} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, fontFamily: 'Inter', fontSize: 14,
          color: href === pathname ? 'var(--t-fg)' : 'rgba(var(--t-fg-rgb), calc(0.6 * var(--t-a)))',
          textDecoration: 'none', padding: '8px 0', borderBottom: '1px solid rgba(var(--t-fg-rgb), calc(0.05 * var(--t-a)))',
        }}>
          <span>{label}</span>
          {href === '/account/messages' && unread > 0 && (
            <span style={{ minWidth: 18, height: 18, borderRadius: 9, background: 'var(--t-gold)', color: 'var(--t-on-fg)', fontSize: 10, fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{unread}</span>
          )}
        </Link>
      ))}
    </nav>
  )
}
