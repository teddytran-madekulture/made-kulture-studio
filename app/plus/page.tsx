'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import SiteNav from '@/components/SiteNav'
import { useIsMobile } from '@/lib/use-is-mobile'

const PAGE_MAX = 1480

interface Pricing { priceCents: number; standardCents?: number; introUntil?: string; isIntro?: boolean; active?: boolean }

function fmtDay(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

const Arrow = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
    <line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" />
  </svg>
)

const BENEFITS: { n: string; title: string; desc: string }[] = [
  { n: '01', title: 'BOOK ON\nSHORT NOTICE', desc: 'See the calendar inside the 48-hour window — the near-term slots non-members can’t — and request a session when a client or an idea can’t wait for two days’ notice.' },
  { n: '02', title: 'CANCELLATION\nPROTECTION', desc: 'Life happens. Cancel a booking — even last minute — and its full value comes back as studio credit for your next session instead of being forfeited.' },
  { n: '03', title: 'NO-SHOW\nCREDIT', desc: 'Couldn’t make it at all? Reach out and we’ll credit your session. Your money stays in the building, ready for the next shoot — it never expires.' },
]

const STEPS: { n: string; title: string; desc: string }[] = [
  { n: '01', title: 'JOIN', desc: 'One yearly membership. Your card is saved so renewals and credit are automatic — turn off auto-renew anytime.' },
  { n: '02', title: 'REQUEST YOUR SLOT', desc: 'Spot a near-term opening and request it. We approve, then you have a short window to lock it in.' },
  { n: '03', title: 'SHOOT WORRY-FREE', desc: 'Plans change? Cancel before your session for automatic credit — or, for a true no-show, get credited on request.' },
]

export default function PlusLanding() {
  const isMobile = useIsMobile()
  const [p, setP] = useState<Pricing | null>(null)

  useEffect(() => {
    fetch('/api/account/plus').then(r => r.ok ? r.json() : null).then(d => setP(d)).catch(() => {})
  }, [])

  const priceLabel = p ? `$${(p.priceCents / 100).toFixed(0)}` : '$99'
  const stdLabel   = p?.standardCents ? `$${(p.standardCents / 100).toFixed(0)}` : '$149'
  const isIntro    = !!p?.isIntro
  const member     = !!p?.active
  const ctaLabel   = member ? 'MANAGE MEMBERSHIP' : `GO PLUS · ${priceLabel}/YR`

  const filledCta = (label: string) => (
    <Link href="/account/plus"
      onMouseEnter={e => { const t = e.currentTarget; t.style.background = 'transparent'; t.style.color = '#fff'; t.style.borderColor = 'rgba(255,255,255,0.5)' }}
      onMouseLeave={e => { const t = e.currentTarget; t.style.background = '#fff'; t.style.color = '#080808'; t.style.borderColor = 'transparent' }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 18, background: '#fff', color: '#080808', border: '1px solid transparent', padding: '16px 26px', textDecoration: 'none', transition: 'background 0.2s ease, color 0.2s ease, border-color 0.2s ease' }}>
      <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 12, fontWeight: 500, letterSpacing: '0.22em', textTransform: 'uppercase' }}>{label}</span>
      <Arrow />
    </Link>
  )

  const outlineCta = (label: string) => (
    <Link href="/account/plus"
      onMouseEnter={e => { const t = e.currentTarget; t.style.background = '#fff'; t.style.color = '#080808'; t.style.borderColor = '#fff' }}
      onMouseLeave={e => { const t = e.currentTarget; t.style.background = 'transparent'; t.style.color = '#fff'; t.style.borderColor = 'rgba(255,255,255,0.25)' }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 24, background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', padding: '16px 24px', textDecoration: 'none', transition: 'background 0.2s ease, color 0.2s ease, border-color 0.2s ease' }}>
      <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 12, fontWeight: 500, letterSpacing: '0.25em', textTransform: 'uppercase' }}>{label}</span>
      <Arrow />
    </Link>
  )

  return (
    <main style={{ background: '#080808', minHeight: '100vh', color: '#fff' }}>
      <SiteNav active="plus" />

      {/* HERO */}
      <section style={{ paddingTop: isMobile ? 104 : 168, paddingBottom: isMobile ? 52 : 96, paddingLeft: isMobile ? 20 : 40, paddingRight: isMobile ? 20 : 40, borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'relative', overflow: 'hidden' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(1100px 500px at 15% -10%, rgba(201,178,126,0.12), transparent 60%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: PAGE_MAX, margin: '0 auto', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
            <div style={{ width: 40, height: 1, background: 'rgba(201,178,126,0.6)' }} />
            <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, fontWeight: 500, letterSpacing: '0.2em', color: '#c9b27e', textTransform: 'uppercase' }}>Membership</span>
          </div>
          <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(64px, 12vw, 150px)', color: '#fff', lineHeight: 0.88, letterSpacing: '0.01em', textTransform: 'uppercase', margin: '0 0 28px', maxWidth: 1000 }}>
            Made Kulture<br />Plus.
          </h1>
          <p style={{ fontFamily: 'Inter', fontSize: isMobile ? 15 : 17, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, maxWidth: 560, margin: '0 0 36px' }}>
            For creators who move fast. Book inside the 48-hour window, and never lose a session to a last-minute change — cancellations and no-shows come back to you as studio credit.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 16 : 28, flexWrap: 'wrap' }}>
            {filledCta(ctaLabel)}
            <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
              {isIntro
                ? <><strong style={{ color: '#c9b27e' }}>{priceLabel}/year</strong> intro rate{p?.introUntil ? ` through ${fmtDay(p.introUntil)}` : ''} · {stdLabel} after</>
                : <><strong style={{ color: '#fff' }}>{priceLabel}/year</strong></>}
            </div>
          </div>
        </div>
      </section>

      {/* INTRO URGENCY STRIP */}
      {isIntro && !member && (
        <section style={{ background: 'rgba(201,178,126,0.08)', borderBottom: '1px solid rgba(201,178,126,0.25)', padding: isMobile ? '14px 20px' : '15px 40px' }}>
          <div style={{ maxWidth: PAGE_MAX, margin: '0 auto', fontFamily: 'Inter', fontSize: 13, color: '#c9b27e', lineHeight: 1.5, textAlign: isMobile ? 'left' : 'center' }}>
            <strong>Act now — founding rate.</strong> Join at {priceLabel}/year. The price goes up to {stdLabel} {p?.introUntil ? `after ${fmtDay(p.introUntil)}` : 'soon'}.
          </div>
        </section>
      )}

      {/* BENEFITS */}
      <section style={{ padding: isMobile ? '56px 20px' : '104px 40px' }}>
        <div style={{ maxWidth: PAGE_MAX, margin: '0 auto' }}>
          <div style={{ marginBottom: isMobile ? 40 : 72 }}>
            <div className="label" style={{ marginBottom: 20 }}>What you get</div>
            <h2 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(40px, 7vw, 88px)', color: '#fff', lineHeight: 0.9, margin: 0 }}>Built for the<br />ones who show up.</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 1, background: 'rgba(255,255,255,0.08)' }}>
            {BENEFITS.map(b => (
              <div key={b.n} style={{ background: '#080808', padding: isMobile ? '36px 26px' : '48px 36px' }}>
                <div className="label" style={{ color: '#c9b27e', marginBottom: 24 }}>{b.n}</div>
                <h3 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: isMobile ? 26 : 30, color: '#fff', lineHeight: 1, margin: '0 0 18px', letterSpacing: '0.01em', whiteSpace: 'pre-line' }}>{b.title}</h3>
                <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, margin: 0 }}>{b.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section style={{ background: '#111111', borderTop: '1px solid rgba(255,255,255,0.1)', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: isMobile ? '56px 20px' : '100px 40px' }}>
        <div style={{ maxWidth: PAGE_MAX, margin: '0 auto' }}>
          <div style={{ marginBottom: isMobile ? 40 : 72 }}>
            <div className="label" style={{ marginBottom: 20 }}>How it works</div>
            <h2 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(40px, 7vw, 88px)', color: '#fff', lineHeight: 0.9, margin: 0 }}>Simple. Fast.<br />On your terms.</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 1, background: 'rgba(255,255,255,0.06)' }}>
            {STEPS.map(s => (
              <div key={s.n} style={{ background: '#111111', padding: isMobile ? '36px 26px' : '48px 36px' }}>
                <div className="label" style={{ marginBottom: 24 }}>{s.n}</div>
                <h3 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: isMobile ? 24 : 28, color: '#fff', lineHeight: 1, margin: '0 0 16px', letterSpacing: '0.01em' }}>{s.title}</h3>
                <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, margin: 0 }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING / FINAL CTA */}
      <section style={{ padding: isMobile ? '64px 20px' : '120px 40px', textAlign: isMobile ? 'left' : 'center' }}>
        <div style={{ maxWidth: PAGE_MAX, margin: '0 auto' }}>
          <div className="label" style={{ marginBottom: 20, color: '#c9b27e' }}>{isIntro ? 'Founding rate' : 'Membership'}</div>
          <h2 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(72px, 14vw, 180px)', color: '#fff', lineHeight: 0.86, margin: 0 }}>
            {priceLabel}<span style={{ fontFamily: 'Inter', fontSize: isMobile ? 15 : 20, fontWeight: 500, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.45)', marginLeft: 12 }}>/ year</span>
          </h2>
          {isIntro && (
            <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 16 }}>
              Intro rate{p?.introUntil ? ` through ${fmtDay(p.introUntil)}` : ''} — {stdLabel}/year after.
            </div>
          )}
          <div style={{ marginTop: 44, display: 'flex', justifyContent: isMobile ? 'flex-start' : 'center' }}>
            {outlineCta(member ? 'MANAGE MEMBERSHIP' : 'GO PLUS')}
          </div>
          <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.35)', lineHeight: 1.7, marginTop: 26, maxWidth: 560, marginLeft: isMobile ? 0 : 'auto', marginRight: isMobile ? 0 : 'auto' }}>
            Renews yearly · cancel auto-renew anytime · short-notice bookings are studio-approved. Not a member? You can still book with 48 hours’ notice, always.
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ borderTop: '1px solid rgba(255,255,255,0.1)', padding: isMobile ? '48px 20px 36px' : '60px 40px 40px' }}>
        <div style={{ maxWidth: PAGE_MAX, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap', marginBottom: 48 }}>
            <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 22, letterSpacing: '0.05em', color: '#fff', lineHeight: 1 }}>MADE<br />KULTURE</div>
            <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
              {[['Sets', '/sets'], ['Availability', '/availability'], ['Book', '/book'], ['Account', '/account']].map(([l, h]) => (
                <Link key={l} href={h} style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>{l}</Link>
              ))}
            </div>
          </div>
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 24, display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
            <span className="label">© 2026 Madekulture Studio</span>
            <span className="label">Houston / TX</span>
          </div>
        </div>
      </footer>
    </main>
  )
}
