'use client'
// Home page section for the directory (2026-10-02, Directory Plan phase 1).
// Counts + a blurred wall; the button goes to /directory, which sends members
// straight in and shows everyone else the sign-up landing page.
import Link from 'next/link'
import DirectoryWall from '@/components/DirectoryWall'
import MemberCountLine from '@/components/MemberCountLine'

export default function DirectoryTeaser({ isMobile }: { isMobile: boolean }) {
  return (
    <section id="directory" style={{ scrollMarginTop: 80, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1.15fr', borderTop: '1px solid rgba(255,255,255,0.1)', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
      <div style={{ padding: isMobile ? '56px 20px' : '80px 60px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 24, borderRight: isMobile ? 'none' : '1px solid rgba(255,255,255,0.1)' }}>
        <div className="label">MADE KULTURE / THE DIRECTORY</div>
        <h2 style={{ fontSize: isMobile ? 'clamp(40px, 11vw, 56px)' : 'clamp(48px, 5vw, 80px)', color: '#fff' }}>HOUSTON&apos;S<br />CREATIVE<br />NETWORK.</h2>
        <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, maxWidth: 440 }}>
          The photographers, models, stylists and makeup artists who shoot here, all in one place. Find your next team, or get found by theirs.
        </p>
        <MemberCountLine />
        <div>
          <Link href="/directory"
            onMouseEnter={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#fff' }}
            onMouseLeave={e => { e.currentTarget.style.background = '#fff'; e.currentTarget.style.color = '#080808' }}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 24, background: '#fff', color: '#080808', border: '1px solid #fff', padding: '16px 24px', textDecoration: 'none', transition: 'background 0.2s ease, color 0.2s ease' }}>
            <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 12, fontWeight: 500, letterSpacing: '0.25em', textTransform: 'uppercase' }}>EXPLORE THE DIRECTORY</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
          </Link>
        </div>
      </div>
      <Link href="/directory" style={{ display: 'block', minHeight: isMobile ? 300 : 520 }} aria-label="Explore the directory">
        <DirectoryWall />
      </Link>
    </section>
  )
}
