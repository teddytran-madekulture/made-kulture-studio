'use client'
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

// Desktop-only vertical sidebar. On mobile the nav lives in AccountMenu
// (a full-screen overlay), so this renders nothing.
export default function AccountNav() {
  const isMobile = useIsMobile()
  const pathname = usePathname()
  if (isMobile) return null

  return (
    <nav className="acct-nav">
      <Link href="/" style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, fontFamily: 'Inter', fontSize: 13,
        color: 'rgba(255,255,255,0.55)', textDecoration: 'none', marginBottom: 24,
      }}
        onMouseEnter={e => (e.currentTarget.style.color = '#fff')}
        onMouseLeave={e => (e.currentTarget.style.color = 'rgba(255,255,255,0.55)')}
      >← Back to Home</Link>
      <div style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.3)', marginBottom: 16 }}>ACCOUNT</div>
      {ITEMS.map(({ href, label }) => (
        <Link key={href} href={href} style={{
          display: 'block', fontFamily: 'Inter', fontSize: 14,
          color: href === pathname ? '#fff' : 'rgba(255,255,255,0.6)',
          textDecoration: 'none', padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>{label}</Link>
      ))}
    </nav>
  )
}
