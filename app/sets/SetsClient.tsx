'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import SiteNav from '@/components/SiteNav'
import { useIsMobile } from '@/lib/use-is-mobile'
import type { PageContent } from '@/lib/site-content'
import { parseList } from '@/lib/content-list'
import { fmt as nl } from '@/lib/fmt'


// ─── Types ──────────────────────────────────────────────────────────────────────

interface ApiSet {
  id: string
  slug: string
  name: string
  description: string | null
  rate_per_hour: number
  min_hours: number | null
  capacity: number
  features: string[] | null
  photo_url: string | null
  dimensions: string | null
  category: string | null
  accent_gradient: string | null
  sort_order: number | null
}

const DEFAULT_GRADIENT = 'linear-gradient(135deg, #141414 0%, #1e1e1e 100%)'

// The full-warehouse buyout is a fixed offering, not a set row — kept here.
const STUDIO = {
  name: 'Full Studio Takeover', price: 400,
  photo: '/images/sets/studio-one.jpg',
  gradient: 'linear-gradient(135deg, #0a0806 0%, #161210 100%)',
  desc: 'The entire warehouse is yours. Every set, all equipment, and full creative freedom — with zero other productions on site. Built for large crews, music videos, brand campaigns, and productions that need room to breathe.',
  capacity: '30 people',
  sqft: '~10,000 sq ft',
  tags: ['Full Warehouse', 'All Sets', 'Studio One', 'Private', 'Up to 30 People'],
}

// ─── Set Card ─────────────────────────────────────────────────────────────────

function SetCard({ set, num }: { set: ApiSet; num: string }) {
  const [hovered, setHovered] = useState(false)
  const gradient = set.accent_gradient || DEFAULT_GRADIENT

  return (
    <Link
      href={`/sets/${set.slug}`}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ position: 'relative', display: 'block', aspectRatio: '3/4', background: gradient, overflow: 'hidden', textDecoration: 'none' }}
    >
      {set.photo_url && (
        <img
          src={set.photo_url}
          alt={set.name}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', transition: 'transform 0.6s', transform: hovered ? 'scale(1.05)' : 'scale(1)' }}
          onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
        />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.25) 42%, transparent 68%)' }} />
      <div style={{ position: 'absolute', top: 18, left: 22, fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.55)' }}>{num}</div>
      <div style={{ position: 'absolute', left: 22, right: 22, bottom: 20, display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <div>
          <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 27, letterSpacing: '0.02em', color: '#fff', lineHeight: 1 }}>{set.name.toUpperCase()}</div>
          <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.65)', marginTop: 8 }}>${set.rate_per_hour} / HR</div>
        </div>
        <span style={{ flexShrink: 0, width: 36, height: 36, border: '1px solid rgba(255,255,255,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', background: hovered ? '#fff' : 'transparent', color: hovered ? '#080808' : '#fff', fontSize: 14, transition: 'background 0.25s ease, color 0.25s ease' }}>↗</span>
      </div>
    </Link>
  )
}

// ─── Premium (featured) set block ─────────────────────────────────────────────

function PremiumBlock({ set, num, isMobile }: { set: ApiSet; num: string; isMobile: boolean }) {
  const gradient = set.accent_gradient || DEFAULT_GRADIENT
  const minNote = set.min_hours && set.min_hours > 1 ? `${set.min_hours} HR MIN` : ''
  return (
    <section style={{ padding: isMobile ? '0 20px 52px' : '0 40px 80px' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.3)', marginBottom: 12 }}>
            PREMIUM SET — ${set.rate_per_hour}/HR{minNote ? ` · ${minNote}` : ''}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 2, background: 'rgba(255,255,255,0.04)', minHeight: isMobile ? 0 : 480 }}>
          <div style={{ position: 'relative', background: gradient, overflow: 'hidden', minHeight: 400 }}>
            {set.photo_url && (
              <img src={set.photo_url} alt={set.name}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.75 }}
                onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
              />
            )}
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to right, transparent 60%, rgba(10,10,10,0.6) 100%)' }} />
            <div style={{ position: 'absolute', top: 24, left: 28, fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 13, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)' }}>{num}</div>
          </div>
          <div style={{ background: '#0a0a0a', padding: isMobile ? '40px 28px' : '48px 40px', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 20 }}>
            <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 48, color: '#fff', letterSpacing: '0.02em', lineHeight: 0.95 }}>
              {set.name.toUpperCase()}
            </div>
            {set.dimensions && <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.3)' }}>{set.dimensions}</div>}
            {set.description && <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, margin: 0 }}>{set.description}</p>}
            {(set.features ?? []).length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(set.features ?? []).map(tag => (
                  <span key={tag} style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.1)', padding: '3px 8px' }}>{tag}</span>
                ))}
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginTop: 4 }}>
              <span style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 40, color: '#fff' }}>${set.rate_per_hour}</span>
              <span style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)' }}>/HR{minNote ? ` · ${minNote}` : ''}</span>
            </div>
            <Link href={`/book?type=set&set=${set.slug}`}
              style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: '#080808', background: '#fff', padding: '14px 24px', textDecoration: 'none', display: 'inline-block', textAlign: 'center' }}>
              BOOK {set.name.toUpperCase()} ↗
            </Link>
          </div>
        </div>
      </div>
    </section>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SetsClient({ content = {} }: { content?: PageContent }) {
  const isMobile = useIsMobile()
  const c = content
  const [sets, setSets] = useState<ApiSet[]>([])
  const [buyoutRate, setBuyoutRate] = useState(400)
  const [surcharge, setSurcharge] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/sets')
      .then(r => r.json())
      .then(d => {
        const s = d.guestSurchargePerHour != null ? Number(d.guestSurchargePerHour) : 10
        setSurcharge(s)
        // Catalog shows the guest rate; members save the surcharge (see banner).
        setSets((d.sets ?? []).map((x: any) => ({ ...x, rate_per_hour: Number(x.rate_per_hour) + s })))
        if (d.buyoutRate) setBuyoutRate(Number(d.buyoutRate))
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [])

  const standard = sets.filter(s => (s.category ?? 'standard') !== 'premium')
  const premium  = sets.filter(s => s.category === 'premium')

  // Display number per set, by overall order.
  const numFor = (set: ApiSet) => {
    const i = sets.findIndex(s => s.id === set.id)
    return String(i + 1).padStart(2, '0')
  }

  const minRate = sets.length ? Math.min(...sets.map(s => s.rate_per_hour)) : 40

  // Live-value tokens usable in editable copy (see lib/site-content.ts).
  const tok = (t: string) => (t ?? '')
    .replace(/\{sets\}/g, loading ? '\u2014' : String(sets.length))
    .replace(/\{min\}/g, loading ? '\u2014' : String(minRate))
    .replace(/\{rate\}/g, loading ? '\u2026' : String(buyoutRate))

  return (
    <main style={{ background: '#080808', minHeight: '100vh' }}>
      <SiteNav active="sets" />

      {surcharge > 0 && (
        <div style={{ background: 'rgba(201,178,126,0.08)', borderBottom: '1px solid rgba(201,178,126,0.25)', padding: '10px 20px', textAlign: 'center', fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#c9b27e' }}>
          Rates shown are guest prices. <strong>Members save ${surcharge}/hr</strong> — <a href="/signup" style={{ color: '#c9b27e', textDecoration: 'underline' }}>make a free account</a> or <a href="/login" style={{ color: '#c9b27e', textDecoration: 'underline' }}>sign in</a>.
        </div>
      )}

      {/* Hero */}
      <section style={{ paddingTop: isMobile ? 104 : 160, paddingBottom: isMobile ? 52 : 80, paddingLeft: isMobile ? 20 : 40, paddingRight: isMobile ? 20 : 40, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 40, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={{ width: 40, height: 1, background: 'rgba(255,255,255,0.4)' }} />
              <span style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.4)' }}>{c.heroEyebrow}</span>
            </div>
            <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(64px, 10vw, 120px)', color: '#fff', lineHeight: 0.9, letterSpacing: '0.02em', margin: 0 }}>
              {nl(c.heroHeadline)}
            </h1>
          </div>
          <div style={{ maxWidth: 360 }}>
            <p style={{ fontFamily: 'Inter', fontSize: 15, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, margin: '0 0 24px' }}>
              {nl(c.heroParagraph)}
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <Link href={c.heroPrimaryHref || '/book?type=set'} style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: '#080808', background: '#fff', padding: '12px 20px', textDecoration: 'none' }}>
                {c.heroPrimaryLabel}
              </Link>
              <Link href={c.heroSecondaryHref || '/book?type=studio'} style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.7)', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', padding: '12px 20px', textDecoration: 'none' }}>
                {c.heroSecondaryLabel}
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {parseList(c.stats).map((s, i) => (
          <div key={i} style={{ padding: isMobile ? '22px 20px' : '32px 40px', borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
            <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 40, color: '#fff', letterSpacing: '0.02em', lineHeight: 1 }}>{tok(s.value)}</div>
            <div style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>{tok(s.label)}</div>
          </div>
        ))}
      </section>

      {/* Standard sets grid */}
      <section style={{ padding: isMobile ? '52px 20px' : '80px 40px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ marginBottom: 48 }}>
            <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.3)', marginBottom: 12 }}>{tok(c.indivEyebrow)}</div>
            <h2 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(36px, 5vw, 60px)', color: '#fff', letterSpacing: '0.02em', margin: 0 }}>{c.indivHeading}</h2>
          </div>

          {loading ? (
            <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.4)', padding: '40px 0' }}>Loading sets…</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(auto-fill, minmax(240px, 1fr))', gap: isMobile ? 10 : 12 }}>
              {standard.map(set => (
                <SetCard key={set.id} set={set} num={numFor(set)} />
              ))}
            </div>
          )}

          <div style={{ marginTop: 16, fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.3)', lineHeight: 1.6 }}>
            {nl(c.indivFootnote)}
          </div>
        </div>
      </section>

      {/* Premium / featured sets */}
      {premium.map(set => (
        <PremiumBlock key={set.id} set={set} num={numFor(set)} isMobile={isMobile} />
      ))}

      {/* Full Studio Takeover */}
      <section style={{ padding: isMobile ? '0 20px 64px' : '0 40px 100px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.3)', marginBottom: 12 }}>{tok(c.buyoutEyebrow)}</div>
          </div>
          <div style={{ position: 'relative', background: STUDIO.gradient, overflow: 'hidden', minHeight: 520 }}>
            <img src={STUDIO.photo} alt="Full Studio"
              style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.45 }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
            />
            <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(8,8,8,0.98) 0%, rgba(8,8,8,0.5) 50%, rgba(8,8,8,0.2) 100%)' }} />

            <div style={{ position: 'relative', zIndex: 1, padding: isMobile ? '40px 24px' : '64px 56px', display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 28 : 60, alignItems: 'end', minHeight: isMobile ? 0 : 520 }}>
              <div>
                <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(48px, 7vw, 88px)', color: '#fff', lineHeight: 0.9, letterSpacing: '0.02em' }}>
                  {nl(c.buyoutHeadline)}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, margin: 0 }}>
                  {nl(c.buyoutDesc)}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  {[
                    { label: 'CAPACITY', value: c.buyoutCapacity },
                    { label: 'SPACE', value: c.buyoutSqft },
                    { label: 'INCLUDES', value: c.buyoutIncludes },
                    { label: 'RATE', value: loading ? '—' : `$${buyoutRate}/hr · 4hr min` },
                  ].map(d => (
                    <div key={d.label}>
                      <div style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>{d.label}</div>
                      <div style={{ fontFamily: 'Inter', fontSize: 13, color: '#fff' }}>{d.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {(c.buyoutTags ?? '').split(',').map(t => t.trim()).filter(Boolean).map(tag => (
                    <span key={tag} style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)', border: '1px solid rgba(255,255,255,0.15)', padding: '3px 8px' }}>{tag}</span>
                  ))}
                </div>
                <Link href="/book?type=studio"
                  style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: '#080808', background: '#fff', padding: '14px 24px', textDecoration: 'none', display: 'inline-block', textAlign: 'center', marginTop: 4 }}>
                  BOOK THE FULL STUDIO ↗
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Footer note */}
      <section style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '40px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24, flexWrap: 'wrap' }}>
        <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.3)', lineHeight: 1.6 }}>
          {nl(c.footerNote)}
        </div>
        <Link href={c.footerCtaHref || '/book'} style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: '#080808', background: '#fff', padding: '12px 24px', textDecoration: 'none' }}>
          {c.footerCtaLabel}
        </Link>
      </section>
    </main>
  )
}
