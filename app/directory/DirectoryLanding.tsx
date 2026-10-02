'use client'
import Link from 'next/link'
import SiteNav from '@/components/SiteNav'
import DirectoryWall from '@/components/DirectoryWall'
import { useIsMobile } from '@/lib/use-is-mobile'
import MemberCountLine from '@/components/MemberCountLine'

const PAGE_MAX = 1480
const NEXT = '/account/directory'

const PERKS = [
  { t: 'BROWSE', d: 'Search by role: photographer, model, stylist, makeup artist, brand.' },
  { t: 'SHOW YOUR WORK', d: 'A profile with your portfolio, links and Instagram.' },
  { t: 'GET CREDITED', d: 'Get tagged on the shoots you work on, right on the photo.' },
  { t: 'CASTINGS', d: 'See open calls from members shooting at the studio.' },
]

const mono = '"JetBrains Mono", ui-monospace, monospace'
const btn = (filled: boolean): React.CSSProperties => ({
  display: 'inline-block', textAlign: 'center', fontFamily: mono, fontSize: 12, fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase',
  padding: '16px 26px', textDecoration: 'none', background: filled ? '#fff' : 'transparent', color: filled ? '#080808' : '#fff',
  border: `1px solid ${filled ? '#fff' : 'rgba(255,255,255,0.35)'}`,
})

export default function DirectoryLanding() {
  const isMobile = useIsMobile()
  return (
    <main style={{ background: '#080808', minHeight: '100vh', color: '#fff' }}>
      <SiteNav active="directory" />
      <div style={{ maxWidth: PAGE_MAX, margin: '0 auto', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.2fr 1fr', minHeight: isMobile ? undefined : 'calc(var(--vh-full) - 80px)' }}>
        <div style={{ padding: isMobile ? '48px 20px' : '96px 60px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 28 }}>
          <div className="label">THE DIRECTORY</div>
          <h1 style={{ fontSize: isMobile ? 'clamp(48px, 14vw, 72px)' : 'clamp(64px, 7vw, 120px)', color: '#fff' }}>GET FOUND.<br />GET BOOKED.</h1>
          <p style={{ fontSize: 17, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, maxWidth: 520 }}>
            A members-only network of Houston creatives, built into the studio. Free with your Made Kulture account.
          </p>
        <MemberCountLine />
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 1, background: 'rgba(255,255,255,0.1)', border: '1px solid rgba(255,255,255,0.1)', maxWidth: 580 }}>
            {PERKS.map(p => (
              <div key={p.t} style={{ background: '#080808', padding: '18px 18px' }}>
                <div style={{ fontFamily: mono, fontSize: 11, fontWeight: 500, letterSpacing: '0.2em', color: '#c9b27e', marginBottom: 6 }}>{p.t}</div>
                <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.5 }}>{p.d}</div>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', flexDirection: isMobile ? 'column' : 'row' }}>
            <Link href={`/signup?next=${encodeURIComponent(NEXT)}`} style={btn(true)}>CREATE A FREE ACCOUNT</Link>
            <Link href={`/login?next=${encodeURIComponent(NEXT)}`} style={btn(false)}>SIGN IN</Link>
          </div>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
            Only members can see profiles. Your own listing stays off until you turn it on.
          </p>
        </div>
        <div style={{ borderLeft: isMobile ? 'none' : '1px solid rgba(255,255,255,0.1)', minHeight: isMobile ? 260 : undefined }}>
          <DirectoryWall />
        </div>
      </div>
    </main>
  )
}
