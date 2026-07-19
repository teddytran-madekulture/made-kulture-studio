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

// Small rotated-square marker for benefit rows.
const Mark = ({ gold }: { gold?: boolean }) => (
  <span style={{ marginTop: 7, width: 6, height: 6, flexShrink: 0, background: gold ? '#c9b27e' : 'rgba(255,255,255,0.35)', transform: 'rotate(45deg)' }} />
)

const FREE_BENEFITS = [
  'Member booking rate — pay less per hour than the guest rate, every session',
  'Save your card for fast, one-tap checkout',
  'Your own creative profile',
  'Creator directory — get found by brands and other creatives',
  'Castings board and direct messaging',
  'Bookings and studio credit, all in one place',
]

const PLUS_BENEFITS = [
  'Book on short notice — request near-term slots inside the 48-hour window. Studio-approved, so an open slot is not a guarantee.',
  'Cancellation protection — cancel anytime and get full studio credit',
  'No-show credit — your money stays in the building for next time',
]

export default function MembershipPage() {
  const isMobile = useIsMobile()
  const [p, setP] = useState<Pricing | null>(null)

  useEffect(() => {
    fetch('/api/account/plus').then(r => r.ok ? r.json() : null).then(d => setP(d)).catch(() => {})
  }, [])

  const priceLabel = p ? `$${(p.priceCents / 100).toFixed(0)}` : '$99'
  const stdLabel   = p?.standardCents ? `$${(p.standardCents / 100).toFixed(0)}` : '$149'
  const isIntro    = !!p?.isIntro
  const member     = !!p?.active

  const filledCta = (label: string, href: string) => (
    <Link href={href}
      onMouseEnter={e => { const t = e.currentTarget; t.style.background = 'transparent'; t.style.color = '#fff'; t.style.borderColor = 'rgba(255,255,255,0.5)' }}
      onMouseLeave={e => { const t = e.currentTarget; t.style.background = '#fff'; t.style.color = '#080808'; t.style.borderColor = 'transparent' }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 18, background: '#fff', color: '#080808', border: '1px solid transparent', padding: '15px 24px', textDecoration: 'none', transition: 'background 0.2s ease, color 0.2s ease, border-color 0.2s ease' }}>
      <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 12, fontWeight: 500, letterSpacing: '0.2em', textTransform: 'uppercase' }}>{label}</span>
      <Arrow />
    </Link>
  )

  const goldCta = (label: string, href: string) => (
    <Link href={href}
      onMouseEnter={e => { const t = e.currentTarget; t.style.background = 'transparent'; t.style.color = '#c9b27e' }}
      onMouseLeave={e => { const t = e.currentTarget; t.style.background = '#c9b27e'; t.style.color = '#080808' }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 16, background: '#c9b27e', color: '#080808', border: '1px solid #c9b27e', padding: '14px 22px', textDecoration: 'none', transition: 'background 0.2s ease, color 0.2s ease' }}>
      <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 12, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase' }}>{label}</span>
      <Arrow />
    </Link>
  )

  const outlineCta = (label: string, href: string) => (
    <Link href={href}
      onMouseEnter={e => { const t = e.currentTarget; t.style.background = '#fff'; t.style.color = '#080808'; t.style.borderColor = '#fff' }}
      onMouseLeave={e => { const t = e.currentTarget; t.style.background = 'transparent'; t.style.color = '#fff'; t.style.borderColor = 'rgba(255,255,255,0.25)' }}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 16, background: 'transparent', color: '#fff', border: '1px solid rgba(255,255,255,0.25)', padding: '14px 22px', textDecoration: 'none', transition: 'background 0.2s ease, color 0.2s ease, border-color 0.2s ease' }}>
      <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 12, fontWeight: 500, letterSpacing: '0.18em', textTransform: 'uppercase' }}>{label}</span>
      <Arrow />
    </Link>
  )

  return (
    <main style={{ background: '#080808', minHeight: '100vh', color: '#fff' }}>
      <SiteNav active="membership" />

      {/* HERO */}
      <section style={{ paddingTop: isMobile ? 104 : 168, paddingBottom: isMobile ? 48 : 84, paddingLeft: isMobile ? 20 : 40, paddingRight: isMobile ? 20 : 40, borderBottom: '1px solid rgba(255,255,255,0.06)', position: 'relative', overflow: 'hidden' }}>
        <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'radial-gradient(1100px 500px at 15% -10%, rgba(201,178,126,0.12), transparent 60%)', pointerEvents: 'none' }} />
        <div style={{ maxWidth: PAGE_MAX, margin: '0 auto', position: 'relative' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 24 }}>
            <div style={{ width: 40, height: 1, background: 'rgba(201,178,126,0.6)' }} />
            <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, fontWeight: 500, letterSpacing: '0.2em', color: '#c9b27e', textTransform: 'uppercase' }}>Membership</span>
          </div>
          <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(58px, 11vw, 138px)', color: '#fff', lineHeight: 0.88, letterSpacing: '0.01em', textTransform: 'uppercase', margin: '0 0 28px', maxWidth: 1000 }}>
            Two ways<br />to belong.
          </h1>
          <p style={{ fontFamily: 'Inter', fontSize: isMobile ? 15 : 17, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, maxWidth: 580, margin: '0 0 8px' }}>
            Every shoot starts with an account — it&apos;s free, and it unlocks member rates, your profile, and the creator directory. When you&apos;re ready to move faster, <strong style={{ color: '#c9b27e' }}>Made Kulture Plus</strong> adds short-notice booking and cancellation protection.
          </p>
        </div>
      </section>

      {/* INTRO URGENCY STRIP */}
      {isIntro && !member && (
        <section style={{ background: 'rgba(201,178,126,0.08)', borderBottom: '1px solid rgba(201,178,126,0.25)', padding: isMobile ? '14px 20px' : '15px 40px' }}>
          <div style={{ maxWidth: PAGE_MAX, margin: '0 auto', fontFamily: 'Inter', fontSize: 13, color: '#c9b27e', lineHeight: 1.5, textAlign: isMobile ? 'left' : 'center' }}>
            <strong>Act now — founding rate.</strong> Plus is {priceLabel}/year, going up to {stdLabel} {p?.introUntil ? `after ${fmtDay(p.introUntil)}` : 'soon'}.
          </div>
        </section>
      )}

      {/* TIERS */}
      <section style={{ padding: isMobile ? '52px 20px' : '96px 40px' }}>
        <div style={{ maxWidth: PAGE_MAX, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 16 : 24, alignItems: 'stretch' }}>

            {/* FREE */}
            <div style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.1)', padding: isMobile ? '32px 26px' : '44px 40px', display: 'flex', flexDirection: 'column' }}>
              <div className="label" style={{ marginBottom: 18 }}>Free</div>
              <h2 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: isMobile ? 40 : 52, color: '#fff', lineHeight: 0.9, letterSpacing: '0.01em', margin: '0 0 6px' }}>Member</h2>
              <div style={{ fontFamily: 'Inter', fontSize: 15, color: 'rgba(255,255,255,0.45)', marginBottom: 28 }}>Create a free account — no cost, ever.</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px' }}>
                {FREE_BENEFITS.map(b => (
                  <li key={b} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
                    <Mark />
                    <span style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6 }}>{b}</span>
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 'auto' }}>{filledCta('Create free account', '/signup')}</div>
            </div>

            {/* PLUS (featured) */}
            <div style={{ background: 'linear-gradient(165deg, rgba(201,178,126,0.11), rgba(201,178,126,0.02))', border: '1px solid rgba(201,178,126,0.45)', padding: isMobile ? '32px 26px' : '44px 40px', display: 'flex', flexDirection: 'column', position: 'relative' }}>
              <div style={{ position: 'absolute', top: 0, right: 0, background: '#c9b27e', color: '#080808', fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 10, fontWeight: 700, letterSpacing: '0.14em', padding: '5px 12px', textTransform: 'uppercase' }}>Upgrade</div>
              <div className="label" style={{ color: '#c9b27e', marginBottom: 18 }}>Plus</div>
              <h2 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: isMobile ? 40 : 52, color: '#fff', lineHeight: 0.9, letterSpacing: '0.01em', margin: '0 0 6px' }}>Plus</h2>
              <div style={{ fontFamily: 'Inter', fontSize: 15, color: 'rgba(255,255,255,0.6)', marginBottom: 28 }}>
                <strong style={{ color: '#fff' }}>{priceLabel}</strong>/year{isIntro ? <span style={{ color: '#c9b27e' }}> · intro rate{p?.introUntil ? ` through ${fmtDay(p.introUntil)}` : ''}</span> : null}
              </div>
              <div style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>Everything in Member, plus:</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 32px' }}>
                {PLUS_BENEFITS.map(b => (
                  <li key={b} style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 14 }}>
                    <Mark gold />
                    <span style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6 }}>{b}</span>
                  </li>
                ))}
              </ul>
              <div style={{ marginTop: 'auto' }}>{goldCta(member ? 'Manage membership' : 'Go Plus', '/account/plus')}</div>
            </div>

          </div>
        </div>
      </section>

      {/* HOW PLUS SHORT-NOTICE WORKS */}
      <section style={{ background: '#111111', borderTop: '1px solid rgba(255,255,255,0.1)', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: isMobile ? '52px 20px' : '96px 40px' }}>
        <div style={{ maxWidth: PAGE_MAX, margin: '0 auto' }}>
          <div style={{ marginBottom: isMobile ? 36 : 64 }}>
            <div className="label" style={{ marginBottom: 20 }}>How Plus works</div>
            <h2 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(36px, 6vw, 76px)', color: '#fff', lineHeight: 0.9, margin: 0 }}>Move fast.<br />Never lose a session.</h2>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(3, 1fr)', gap: 1, background: 'rgba(255,255,255,0.06)' }}>
            {[
              { n: '01', t: 'REQUEST YOUR SLOT', d: 'Spot a near-term opening inside the 48-hour window and request it. An open slot is not a guarantee — the studio may be unavailable even when the calendar looks open. If we approve, you have a short window to lock it in.' },
              { n: '02', t: 'CANCEL WORRY-FREE', d: 'Plans change? Cancel before your session and the full value comes back as studio credit — automatically.' },
              { n: '03', t: 'NEVER LOSE MONEY', d: 'Even a true no-show can be credited on request. Your money stays in the building for the next shoot.' },
            ].map(s => (
              <div key={s.n} style={{ background: '#111111', padding: isMobile ? '32px 24px' : '44px 32px' }}>
                <div className="label" style={{ color: '#c9b27e', marginBottom: 22 }}>{s.n}</div>
                <h3 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: isMobile ? 22 : 26, color: '#fff', lineHeight: 1, margin: '0 0 16px', letterSpacing: '0.01em' }}>{s.t}</h3>
                <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, margin: 0 }}>{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section style={{ padding: isMobile ? '60px 20px' : '110px 40px', textAlign: isMobile ? 'left' : 'center' }}>
        <div style={{ maxWidth: PAGE_MAX, margin: '0 auto' }}>
          <div className="label" style={{ marginBottom: 20, color: '#c9b27e' }}>Join Made Kulture</div>
          <h2 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(52px, 10vw, 128px)', color: '#fff', lineHeight: 0.88, margin: '0 0 40px' }}>Start free.<br />Upgrade anytime.</h2>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', justifyContent: isMobile ? 'flex-start' : 'center' }}>
            {filledCta('Create free account', '/signup')}
            {outlineCta(member ? 'Manage membership' : 'Go Plus', '/account/plus')}
          </div>
          <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.32)', lineHeight: 1.7, marginTop: 28, maxWidth: 660, marginLeft: isMobile ? 0 : 'auto', marginRight: isMobile ? 0 : 'auto' }}>
            Plus renews yearly at the then-current price · cancel auto-renew anytime and keep your benefits through the paid term · membership fees are non-refundable · short-notice bookings are studio-approved and not guaranteed. Not a member? You can always book with 48 hours&apos; notice. See <Link href="/terms" style={{ color: 'rgba(255,255,255,0.45)', textDecoration: 'underline' }}>full terms</Link>.
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
