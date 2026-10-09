'use client'
// The "Shoots" section of the account area (2026-10-09): My Bookings, Castings
// and Mini Sessions are one menu item, switched with these tabs. Each page keeps
// its own URL; this row just sits on top of all three list pages.
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'

const TABS = [
  { href: '/account/bookings', label: 'My Bookings' },
  { href: '/account/castings', label: 'Castings' },
  { href: '/account/minis', label: 'Mini Sessions' },
]
export const SHOOTS_PATHS = TABS.map(t => t.href)

export default function ShootsTabs() {
  const pathname = usePathname() || ''
  const [unseen, setUnseen] = useState(0)
  useEffect(() => {
    fetch('/api/castings/unseen').then(r => (r.ok ? r.json() : { unseen: 0 })).then(d => setUnseen(d.unseen ?? 0)).catch(() => {})
  }, [pathname])
  return (
    <div style={{ display: 'flex', gap: 6, marginBottom: 22, overflowX: 'auto', borderBottom: '1px solid rgba(var(--t-fg-rgb), calc(0.1 * var(--t-a)))' }}>
      {TABS.map(t => {
        const on = pathname === t.href || pathname.startsWith(t.href + '/')
        return (
          <Link key={t.href} href={t.href} style={{
            position: 'relative', fontFamily: 'Inter', fontSize: 14, fontWeight: on ? 700 : 500, whiteSpace: 'nowrap',
            color: on ? 'var(--t-fg)' : 'rgba(var(--t-fg-rgb), calc(0.55 * var(--t-a)))', textDecoration: 'none',
            padding: '10px 12px', borderBottom: on ? '2px solid var(--t-fg)' : '2px solid transparent', marginBottom: -1,
          }}>
            {t.label}
            {t.href === '/account/castings' && unseen > 0 && (
              <span style={{ marginLeft: 6, fontSize: 10, fontWeight: 700, background: 'var(--t-gold)', color: 'var(--t-on-fg)', borderRadius: 8, padding: '1px 6px' }}>{unseen > 9 ? '9+' : unseen}</span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
