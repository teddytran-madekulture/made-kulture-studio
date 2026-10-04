'use client'
// The directory's own header (2026-10-02). It sits at the top of every
// directory page so the network reads as its own site inside the studio's:
// gold ◆ wordmark + Home · Explore · People · Services · Castings · Messages, with a
// quiet way back to booking the studio.
import Link from 'next/link'
import { usePathname } from 'next/navigation'

const TABS = [
  { key: 'home', label: 'Home', href: '/account/directory' },
  { key: 'explore', label: 'Explore', href: '/account/directory/explore' },
  { key: 'people', label: 'People', href: '/account/directory/explore?view=people' },
  { key: 'services', label: 'Services', href: '/account/directory/services' },
  { key: 'castings', label: 'Castings', href: '/account/castings' },
  { key: 'messages', label: 'Messages', href: '/account/messages' },
]

// onView: on the Explore page the Explore/People tabs switch the view in place
// (same route, so a Link to ?view=people would not re-run the page's effect).
export default function DirectoryHeader({ active, onView }: { active?: string; onView?: (v: 'explore' | 'people') => void }) {
  const path = usePathname()
  const current = active ?? (
    path === '/account/directory' ? 'home'
    : path?.startsWith('/account/directory/explore') ? 'explore'
    : path?.startsWith('/account/directory/services') ? 'services'
    : path?.startsWith('/account/castings') ? 'castings'
    : path?.startsWith('/account/messages') ? 'messages' : '')
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px 28px', paddingBottom: 18, marginBottom: 28, borderBottom: '1px solid rgba(var(--t-fg-rgb), calc(0.1 * var(--t-a)))' }}>
      <Link href="/account/directory" style={{ display: 'flex', alignItems: 'baseline', gap: 10, textDecoration: 'none', color: 'var(--t-fg)', whiteSpace: 'nowrap' }}>
        <span style={{ color: 'var(--t-gold)', fontSize: 14 }}>◆</span>
        <span style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 26, letterSpacing: '0.02em', lineHeight: 1 }}>THE DIRECTORY</span>
        <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(var(--t-fg-rgb), calc(0.5 * var(--t-a)))' }}>by Made Kulture</span>
      </Link>
      <nav style={{ display: 'flex', gap: 24, overflowX: 'auto', maxWidth: '100%' }}>
        {TABS.map(t => (onView && (t.key === 'explore' || t.key === 'people')) ? (
          <button key={t.key} onClick={() => onView(t.key as 'explore' | 'people')} style={{
            background: 'none', border: 'none', borderBottom: `1.5px solid ${current === t.key ? 'var(--t-fg)' : 'transparent'}`, cursor: 'pointer',
            fontFamily: 'Inter', fontSize: 14, whiteSpace: 'nowrap', padding: '6px 0',
            color: current === t.key ? 'var(--t-fg)' : 'rgba(var(--t-fg-rgb), calc(0.55 * var(--t-a)))',
          }}>{t.label}</button>
        ) : (
          <Link key={t.key} href={t.href} style={{
            fontFamily: 'Inter', fontSize: 14, textDecoration: 'none', whiteSpace: 'nowrap', padding: '6px 0',
            color: current === t.key ? 'var(--t-fg)' : 'rgba(var(--t-fg-rgb), calc(0.55 * var(--t-a)))',
            borderBottom: `1.5px solid ${current === t.key ? 'var(--t-fg)' : 'transparent'}`,
          }}>{t.label}</Link>
        ))}
      </nav>
      <Link href="/book" style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(var(--t-fg-rgb), calc(0.55 * var(--t-a)))', textDecoration: 'none', whiteSpace: 'nowrap' }}>Book the studio ↗</Link>
    </div>
  )
}
