'use client'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import type { ReactNode, CSSProperties } from 'react'

// Shared admin sidebar for the standalone admin pages (marketing, promos, roles,
// signups, portfolio, inbox, stack, add-prop). It's a faithful visual match of the
// sidebar built into /admin/dashboard, so navigation feels continuous. The dashboard
// keeps its own inline sidebar (with instant in-page view switching); here the
// "view" items deep-link into the dashboard via ?view=. Login (/admin) and the
// dashboard render bare — this wrapper only adds the sidebar elsewhere.

const DIM = 'rgba(255,255,255,0.45)'
const sectionHdr: CSSProperties = { padding: '14px 12px 6px 14px', color: 'rgba(255,255,255,0.25)', fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600, letterSpacing: '0.15em' }

function Item({ href, icon, label, active, color }: { href: string; icon: string; label: string; active?: boolean; color?: string }) {
  return (
    <a href={href} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 10, boxSizing: 'border-box',
      background: active ? 'rgba(255,255,255,0.07)' : 'transparent', textDecoration: 'none',
      borderLeft: active ? '2px solid #fff' : '2px solid transparent',
      padding: '9px 12px', fontFamily: 'Inter, sans-serif', fontSize: 13,
      color: active ? '#fff' : (color || DIM),
    }}>
      <span style={{ width: 16, textAlign: 'center', flexShrink: 0, fontWeight: label === 'June Inbox' ? 800 : undefined }}>{icon}</span>{label}
    </a>
  )
}

function Sidebar() {
  const pathname = usePathname() || ''
  const router = useRouter()
  const on = (p: string) => pathname === p || pathname.startsWith(p + '/')
  const logout = async () => { await fetch('/api/admin/auth', { method: 'DELETE' }); router.push('/admin') }
  const D = '/admin/dashboard?view='

  return (
    <div style={{ position: 'fixed', left: 0, top: 0, bottom: 0, width: 220, background: '#080808', borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', zIndex: 60 }}>
      <div style={{ padding: '28px 24px 24px' }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, letterSpacing: '0.05em', color: '#fff', lineHeight: 1 }}>MADE KULTURE</div>
        <div style={{ fontSize: 10, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.25)', marginTop: 3 }}>/ ADMIN</div>
        <div style={{ marginTop: 12, width: 24, height: 2, background: '#d4a843' }} />
      </div>

      <nav style={{ flex: 1, padding: '4px 12px', overflowY: 'auto' }}>
        <div style={sectionHdr}>BOOKINGS</div>
        <Item href={`${D}list`} icon="≡" label="List View" />
        <Item href={`${D}calendar`} icon="⊡" label="Calendar" />

        <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '12px 0' }} />
        <Item href="/admin/inbox" icon="J" label="June Inbox" active={on('/admin/inbox')} color="#d4a843" />
        <Item href="/admin/stack" icon="⚙" label="Services & Stack" active={on('/admin/stack')} />
        <Item href={`${D}customers`} icon="👤" label="Customers" />
        <Item href={`${D}sets`} icon="▦" label="Sets" />
        <Item href={`${D}equipment`} icon="🎥" label="Equipment" />
        <Item href={`${D}props`} icon="🛋" label="Props" />

        <div style={sectionHdr}>GROWTH</div>
        <Item href="/admin/marketing" icon="📣" label="Marketing" active={on('/admin/marketing')} />
        <Item href="/admin/promos" icon="🏷" label="Promo Codes" active={on('/admin/promos')} />
        <Item href="/admin/roles" icon="🛡" label="Roles" active={on('/admin/roles')} />
        <Item href="/admin/signups" icon="✚" label="Signups" active={on('/admin/signups')} />
        <Item href="/admin/portfolio" icon="🖼" label="Portfolio" active={on('/admin/portfolio')} />

        <div style={sectionHdr}>SETTINGS</div>
        <Item href={`${D}emails`} icon="✉" label="Emails" />
        <Item href={`${D}usage`} icon="📊" label="Usage" />
        <Item href={`${D}legal`} icon="§" label="Legal" />
        <Item href={`${D}profile`} icon="⊙" label="Account" />
      </nav>

      <div style={{ padding: '16px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <a href="/admin/dashboard" style={{ background: '#fff', border: 'none', padding: '10px', textAlign: 'center', textDecoration: 'none', fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: '#080808' }}>+ NEW BOOKING</a>
        <a href="/desk" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', padding: '9px', fontFamily: 'Inter, sans-serif', fontSize: 11, textAlign: 'center', textDecoration: 'none', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.55)' }}>FRONT DESK →</a>
        <a href="/staff" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', padding: '9px', fontFamily: 'Inter, sans-serif', fontSize: 11, textAlign: 'center', textDecoration: 'none', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.55)' }}>STAFF →</a>
        <button onClick={logout} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', padding: '9px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)' }}>LOG OUT</button>
      </div>
    </div>
  )
}

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || ''
  // Login and the dashboard render bare (dashboard has its own sidebar).
  const bare = pathname === '/admin' || pathname === '/admin/dashboard' || pathname.startsWith('/admin/dashboard/')
  if (bare) return <>{children}</>
  return (
    <>
      <Sidebar />
      <div style={{ marginLeft: 220 }}>{children}</div>
    </>
  )
}
