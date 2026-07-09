'use client'
import { usePathname, useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import type { ReactNode, CSSProperties } from 'react'

// Shared admin sidebar for the standalone admin pages (marketing, promos, portfolio,
// inbox, stack, add-prop). It's a faithful visual match of the sidebar built into
// /admin/dashboard, so navigation feels continuous. The dashboard keeps its own
// inline sidebar (with instant in-page view switching); here the "view" items
// deep-link into the dashboard via ?view=. Login (/admin) and the dashboard render
// bare — this wrapper only adds the sidebar elsewhere.
//
// Responsive: on phones the sidebar is off-canvas (hamburger to open, tap-away to
// close); tapping a link navigates to a fresh page where it starts collapsed.

const DIM = 'rgba(255,255,255,0.45)'
const sectionHdr: CSSProperties = { padding: '14px 12px 6px 14px', color: 'rgba(255,255,255,0.25)', fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600, letterSpacing: '0.15em' }

function Item({ href, icon, label, active, color, indent }: { href: string; icon: string; label: string; active?: boolean; color?: string; indent?: boolean }) {
  return (
    <a href={href} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 10, boxSizing: 'border-box',
      background: active ? 'rgba(255,255,255,0.07)' : 'transparent', textDecoration: 'none',
      borderLeft: active ? '2px solid #fff' : '2px solid transparent',
      padding: indent ? '9px 12px 9px 30px' : '9px 12px', fontFamily: 'Inter, sans-serif', fontSize: 13,
      color: active ? '#fff' : (color || DIM),
    }}>
      <span style={{ width: 16, textAlign: 'center', flexShrink: 0, fontWeight: label === 'June Inbox' ? 800 : undefined }}>{icon}</span>{label}
    </a>
  )
}

function SidebarInner() {
  const pathname = usePathname() || ''
  const router = useRouter()
  const [settingsOpen, setSettingsOpen] = useState(false)
  const on = (p: string) => pathname === p || pathname.startsWith(p + '/')
  const logout = async () => { await fetch('/api/admin/auth', { method: 'DELETE' }); router.push('/admin') }
  const D = '/admin/dashboard?view='

  return (
    <>
      <div style={{ padding: '28px 24px 24px' }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, letterSpacing: '0.05em', color: '#fff', lineHeight: 1 }}>MADE KULTURE</div>
        <div style={{ fontSize: 10, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.25)', marginTop: 3 }}>/ ADMIN</div>
        <div style={{ marginTop: 12, width: 24, height: 2, background: '#d4a843' }} />
      </div>

      <nav style={{ flex: 1, padding: '4px 12px', overflowY: 'auto' }}>
        <div style={sectionHdr}>BOOKINGS</div>
        <Item href={`${D}list`} icon="≡" label="List View" />
        <Item href={`${D}calendar`} icon="⊡" label="Calendar" />
        <Item href="/admin/inbox" icon="J" label="June Inbox" active={on('/admin/inbox')} color="#d4a843" />

        <div style={sectionHdr}>WEBSITE</div>
        <Item href="/admin/website" icon="🌐" label="Website Editor →" color="#d4a843" />

        <div style={sectionHdr}>STUDIO</div>
        <Item href={`${D}sets`} icon="▦" label="Products & Pricing" />
        <Item href="/admin/jukebox" icon="♪" label="Jukebox" active={on('/admin/jukebox')} />

        <div style={sectionHdr}>CUSTOMERS</div>
        <Item href={`${D}customers`} icon="👤" label="Client List" />
        <Item href="/admin/portfolio" icon="🖼" label="Portfolio" active={on('/admin/portfolio')} />
        <Item href="/admin/roles" icon="◆" label="Directory Roles" active={on('/admin/roles')} />

        <div style={sectionHdr}>MARKETING</div>
        <Item href="/admin/marketing" icon="📣" label="Email Campaign" active={on('/admin/marketing')} />
        <Item href="/admin/promos" icon="🏷" label="Promo Codes" active={on('/admin/promos')} />

        <div style={sectionHdr}>FUNDING</div>
        <Item href="/admin/funding" icon="$" label="Funding Tracker" active={on('/admin/funding')} />

        <button onClick={() => setSettingsOpen(o => !o)} style={{ ...sectionHdr, display: 'flex', width: '100%', alignItems: 'center', justifyContent: 'space-between', background: 'transparent', border: 'none', cursor: 'pointer' }}>
          SETTINGS <span style={{ fontSize: 8 }}>{settingsOpen ? '▲' : '▼'}</span>
        </button>
        {settingsOpen && (
          <>
            <Item href={`${D}emails`} icon="✉" label="Emails" />
            <Item href={`${D}usage`} icon="📊" label="Usage" />
            <Item href={`${D}legal`} icon="§" label="Legal" />
            <Item href={`${D}profile`} icon="⊙" label="Account" />
            <Item href="/admin/stack" icon="⚙" label="Services & Stack" active={on('/admin/stack')} />
          </>
        )}
      </nav>

      <div style={{ padding: '16px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <a href="/admin/dashboard" style={{ background: '#fff', border: 'none', padding: '10px', textAlign: 'center', textDecoration: 'none', fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: '#080808' }}>+ NEW BOOKING</a>
        <a href="/desk" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', padding: '9px', fontFamily: 'Inter, sans-serif', fontSize: 11, textAlign: 'center', textDecoration: 'none', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.55)' }}>FRONT DESK →</a>
        <a href="/staff" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', padding: '9px', fontFamily: 'Inter, sans-serif', fontSize: 11, textAlign: 'center', textDecoration: 'none', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.55)' }}>STAFF →</a>
        <button onClick={logout} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', padding: '9px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)' }}>LOG OUT</button>
      </div>
    </>
  )
}

export default function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() || ''
  const [isMobile, setIsMobile] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

  // Login and the dashboard render bare (dashboard has its own sidebar + mobile
  // nav); the Website workspace renders bare too (it has its own WebsiteShell).
  const bare = pathname === '/admin' || pathname === '/admin/dashboard' || pathname.startsWith('/admin/dashboard/') || pathname === '/admin/website' || pathname.startsWith('/admin/website/')
  if (bare) return <>{children}</>

  const hidden = isMobile && !open

  return (
    <>
      {isMobile && !open && (
        <button onClick={() => setOpen(true)} aria-label="Open menu" style={{ position: 'fixed', top: 10, left: 10, zIndex: 70, width: 42, height: 42, background: '#141416', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, color: '#fff', fontSize: 18, cursor: 'pointer' }}>☰</button>
      )}
      {isMobile && open && (
        <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 61 }} />
      )}
      <aside style={{
        position: 'fixed', left: 0, top: 0, bottom: 0, width: 220, background: '#080808',
        borderRight: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', zIndex: 62,
        transform: hidden ? 'translateX(-100%)' : 'translateX(0)', transition: 'transform 0.25s ease',
        boxShadow: isMobile && open ? '0 0 40px rgba(0,0,0,0.6)' : 'none',
      }}>
        <SidebarInner />
      </aside>
      <div style={{ marginLeft: isMobile ? 0 : 220, paddingTop: isMobile ? 52 : 0, minHeight: '100vh' }}>{children}</div>
    </>
  )
}
