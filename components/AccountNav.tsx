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

export default function AccountNav() {
  const isMobile = useIsMobile()
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const current = ITEMS.find(i => i.href === pathname) || ITEMS[0]

  // Desktop: vertical sidebar list.
  if (!isMobile) {
    return (
      <nav className="acct-nav">
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

  // Mobile: collapsible dropdown.
  return (
    <nav style={{ width: '100%', position: 'relative' }}>
      <button onClick={() => setOpen(o => !o)} style={{
        width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: '#141414', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8,
        padding: '13px 16px', cursor: 'pointer', color: '#fff',
        fontFamily: 'Inter', fontSize: 14,
      }}>
        <span><span style={{ fontSize: 10, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)', marginRight: 10 }}>ACCOUNT</span>{current.label}</span>
        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div style={{ marginTop: 6, border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, overflow: 'hidden', background: '#0f0f0f' }}>
          {ITEMS.map(({ href, label }) => (
            <Link key={href} href={href} onClick={() => setOpen(false)} style={{
              display: 'block', fontFamily: 'Inter', fontSize: 14, textDecoration: 'none',
              padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,0.05)',
              color: href === pathname ? '#fff' : 'rgba(255,255,255,0.6)',
              background: href === pathname ? 'rgba(255,255,255,0.05)' : 'transparent',
            }}>{label}</Link>
          ))}
        </div>
      )}
    </nav>
  )
}
