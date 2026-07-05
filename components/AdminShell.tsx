'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import type { ReactNode } from 'react'

const C = { bg: '#0b0b0d', side: '#0e0e11', line: 'rgba(255,255,255,0.08)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.5)', accent: '#c9b27e' }

// Simple inline stroke icons (no icon lib in this project).
const I = {
  dashboard: 'M3 3h7v7H3zM14 3h7v7h-7zM14 14h7v7h-7zM3 14h7v7H3z',
  inbox: 'M3 12l3-8h12l3 8M3 12v6a1 1 0 001 1h16a1 1 0 001-1v-6M3 12h5l1 2h6l1-2h5',
  marketing: 'M3 11l18-6v14l-18-6zM3 11v4M8 13v5a2 2 0 004 0',
  promos: 'M20.6 13.4l-7.2 7.2a2 2 0 01-2.8 0l-6.2-6.2a2 2 0 01-.6-1.4V5a2 2 0 012-2h7.6a2 2 0 011.4.6l6.2 6.2a2 2 0 010 2.6zM8 8h.01',
  roles: 'M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z',
  signups: 'M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8M19 8v6M22 11h-6',
  portfolio: 'M3 3h18v18H3zM3 15l5-5 4 4 3-3 6 6',
  stack: 'M12 2l9 5-9 5-9-5zM3 12l9 5 9-5M3 17l9 5 9-5',
  prop: 'M12 5v14M5 12h14',
  back: 'M15 18l-6-6 6-6',
}

const NAV: { label: string; href: string; icon: keyof typeof I }[] = [
  { label: 'Dashboard', href: '/admin/dashboard', icon: 'dashboard' },
  { label: 'Inbox', href: '/admin/inbox', icon: 'inbox' },
  { label: 'Marketing', href: '/admin/marketing', icon: 'marketing' },
  { label: 'Promo Codes', href: '/admin/promos', icon: 'promos' },
  { label: 'Roles', href: '/admin/roles', icon: 'roles' },
  { label: 'Signups', href: '/admin/signups', icon: 'signups' },
  { label: 'Portfolio', href: '/admin/portfolio', icon: 'portfolio' },
  { label: 'Add Prop', href: '/admin/props/new', icon: 'prop' },
  { label: 'Services & Stack', href: '/admin/stack', icon: 'stack' },
]

function Icon({ d }: { d: string }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d={d} />
    </svg>
  )
}

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || ''
  // The /admin login screen renders bare — no shell before sign-in.
  if (pathname === '/admin') return <>{children}</>

  return (
    <div style={{ display: 'flex', minHeight: '100vh', background: C.bg, color: C.text }}>
      <aside style={{ width: 224, flexShrink: 0, background: C.side, borderRight: `1px solid ${C.line}`, position: 'sticky', top: 0, height: '100vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <div style={{ padding: '22px 22px 18px' }}>
          <div style={{ fontFamily: '"Courier New", monospace', fontSize: 14, fontWeight: 700, letterSpacing: '0.28em', color: '#fff' }}>MADE KULTURE</div>
          <div style={{ fontSize: 10, letterSpacing: '0.3em', color: C.accent, marginTop: 4 }}>ADMIN</div>
        </div>
        <nav style={{ display: 'flex', flexDirection: 'column', gap: 2, padding: '4px 12px' }}>
          {NAV.map(n => {
            const active = pathname === n.href || pathname.startsWith(n.href + '/')
            return (
              <Link key={n.href} href={n.href} style={{
                display: 'flex', alignItems: 'center', gap: 11, padding: '9px 12px', borderRadius: 8,
                textDecoration: 'none', fontSize: 13.5, fontWeight: active ? 600 : 500,
                color: active ? '#0b0b0d' : C.dim, background: active ? C.accent : 'transparent',
              }}>
                <Icon d={I[n.icon]} />{n.label}
              </Link>
            )
          })}
        </nav>
        <div style={{ marginTop: 'auto', padding: '14px 20px', borderTop: `1px solid ${C.line}` }}>
          <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 9, color: C.dim, fontSize: 12.5, textDecoration: 'none' }}>
            <Icon d={I.back} />View live site
          </Link>
        </div>
      </aside>
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  )
}
