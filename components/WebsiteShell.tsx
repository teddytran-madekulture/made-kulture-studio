'use client'
import { usePathname } from 'next/navigation'
import { useState, useEffect } from 'react'
import type { ReactNode, CSSProperties } from 'react'

// Sidebar shell for the Website workspace (/admin/website/*) — the site-design
// side of the house, kept separate from the business-ops admin dashboard. Same
// visual language as AdminShell so it feels like the same product, but its own
// nav: site pages + the customer-facing catalogs (equipment, props), plus a way
// back to Admin.
//
// Responsive: on phones the sidebar is off-canvas (hamburger to open, tap-away
// to close), matching AdminShell's behavior.

const DIM = 'rgba(255,255,255,0.45)'
const sectionHdr: CSSProperties = { padding: '14px 12px 6px 14px', color: 'rgba(255,255,255,0.25)', fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600, letterSpacing: '0.15em' }

function Item({ href, icon, label, active }: { href: string; icon: string; label: string; active?: boolean }) {
  return (
    <a href={href} style={{
      width: '100%', display: 'flex', alignItems: 'center', gap: 10, boxSizing: 'border-box',
      background: active ? 'rgba(255,255,255,0.07)' : 'transparent', textDecoration: 'none',
      borderLeft: active ? '2px solid #fff' : '2px solid transparent',
      padding: '9px 12px', fontFamily: 'Inter, sans-serif', fontSize: 13,
      color: active ? '#fff' : DIM,
    }}>
      <span style={{ width: 16, textAlign: 'center', flexShrink: 0 }}>{icon}</span>{label}
    </a>
  )
}

function SidebarInner() {
  const pathname = usePathname() || ''
  const on = (p: string) => pathname === p || pathname.startsWith(p + '/')

  return (
    <>
      <div style={{ padding: '28px 24px 24px' }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, letterSpacing: '0.05em', color: '#fff', lineHeight: 1 }}>MADE KULTURE</div>
        <div style={{ fontSize: 10, letterSpacing: '0.15em', color: '#d4a843', marginTop: 3 }}>/ WEBSITE</div>
        <div style={{ marginTop: 12, width: 24, height: 2, background: '#d4a843' }} />
      </div>

      <nav style={{ flex: 1, padding: '4px 12px', overflowY: 'auto' }}>
        <div style={sectionHdr}>PAGES</div>
        <Item href="/admin/website/pages/home" icon="🏠" label="Home Page" active={on('/admin/website/pages/home') || on('/admin/website/home')} />
        <Item href="/admin/website/pages/sets" icon="▦" label="Sets Page" active={on('/admin/website/pages/sets')} />
        <Item href="/admin/website/pages/studio-rules" icon="§" label="Studio Rules" active={on('/admin/website/pages/studio-rules')} />
        <Item href="/admin/website/pages/props" icon="🛋" label="Props Page" active={on('/admin/website/pages/props')} />
        <Item href="/admin/website/pages/gear" icon="🎥" label="Gear Page" active={on('/admin/website/pages/gear')} />

        <div style={sectionHdr}>CATALOG</div>
        <Item href="/admin/website/equipment" icon="🎥" label="Equipment" active={on('/admin/website/equipment')} />
        <Item href="/admin/website/props" icon="🛋" label="Props" active={on('/admin/website/props')} />
      </nav>

      <div style={{ padding: '16px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <a href="/" target="_blank" rel="noreferrer" style={{ background: '#fff', border: 'none', padding: '10px', textAlign: 'center', textDecoration: 'none', fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: '#080808' }}>VIEW LIVE SITE ↗</a>
        <a href="/admin/dashboard" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', padding: '9px', fontFamily: 'Inter, sans-serif', fontSize: 11, textAlign: 'center', textDecoration: 'none', letterSpacing: '0.12em', color: 'rgba(255,255,255,0.55)' }}>← BACK TO ADMIN</a>
      </div>
    </>
  )
}

export default function WebsiteShell({ children }: { children: ReactNode }) {
  const [isMobile, setIsMobile] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)')
    const update = () => setIsMobile(mq.matches)
    update()
    mq.addEventListener('change', update)
    return () => mq.removeEventListener('change', update)
  }, [])

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
