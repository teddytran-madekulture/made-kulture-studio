'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import SiteNav from '@/components/SiteNav'
import { useIsMobile } from '@/lib/use-is-mobile'

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
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ display: 'flex', flexDirection: 'column', background: '#0a0a0a', position: 'relative', overflow: 'hidden' }}
    >
      {/* Photo / gradient */}
      <div style={{ position: 'relative', aspectRatio: '4/3', background: gradient, overflow: 'hidden' }}>
        {set.photo_url && (
          <img
            src={set.photo_url}
            alt={set.name}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: hovered ? 0.9 : 0.75, transition: 'opacity 0.4s, transform 0.6s', transform: hovered ? 'scale(1.03)' : 'scale(1)' }}
            onError={e => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        )}
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(to top, rgba(10,10,10,1) 0%, rgba(10,10,10,0.1) 60%, transparent 100%)' }} />
        <div style={{ position: 'absolute', top: 20, left: 24, fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 13, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.3)' }}>
          {num}
        </div>
        <div style={{ position: 'absolute', top: 20, right: 24, fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 18, color: '#fff' }}>
          ${set.rate_per_hour}<span style={{ fontSize: 11, fontFamily: 'Inter', fontWeight: 400, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)', marginLeft: 3 }}>/HR</span>
        </div>
      </div>

      {/* Info */}
      <div style={{ padding: '24px 28px 28px', display: 'flex', flexDirection: 'column', gap: 12, flex: 1 }}>
        <div>
          <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 28, letterSpacing: '0.03em', color: '#fff', lineHeight: 1, marginBottom: 6 }}>
            {set.name.toUpperCase()}
          </div>
          {set.dimensions && (
            <div style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.3)', fontWeight: 500 }}>
              {set.dimensions}
            </div>
          )}
        </div>

        {set.description && (
          <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7, margin: 0, flex: 1 }}>
            {set.description}
          </p>
        )}

        {(set.features ?? []).length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {(set.features ?? []).map(tag => (
              <span key={tag} style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.35)', border: '1px solid rgba(255,255,255,0.1)', padding: '3px 8px' }}>
                {tag}
              </span>
            ))}
          </div>
        )}

        <Link href={`/book?type=set&set=${set.slug}`}
          style={{
            fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em',
            color: '#080808', background: '#fff', padding: '12px 20px', textDecoration: 'none',
            display: 'inline-block', marginTop: 8, textAlign: 'center', transition: 'opacity 0.2s',
          }}
          onMouseEnter={e => (e.currentTarget.style.opacity = '0.85')}
          onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
        >
          BOOK {set.name.toUpperCase()} ↗
        </Link>
      </div>
    </div>
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

export default function SetsPage() {
  const isMobile = useIsMobile()
  const [sets, setSets] = useState<ApiSet[]>([])
  const [buyoutRate, setBuyoutRate] = useState(400)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/sets')
      .then(r => r.json())
      .then(d => { setSets(d.sets ?? []); if (d.buyoutRate) setBuyoutRate(Number(d.buyoutRate)); setLoading(false) })
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

  return (
    <main style={{ background: '#080808', minHeight: '100vh' }}>
      <SiteNav active="sets" />

      {/* Hero */}
      <section style={{ paddingTop: isMobile ? 104 : 160, paddingBottom: isMobile ? 52 : 80, paddingLeft: isMobile ? 20 : 40, paddingRight: isMobile ? 20 : 40, borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 40, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 20 }}>
              <div style={{ width: 40, height: 1, background: 'rgba(255,255,255,0.4)' }} />
              <span style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.4)' }}>4825 GULF FREEWAY · HOUSTON TX</span>
            </div>
            <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(64px, 10vw, 120px)', color: '#fff', lineHeight: 0.9, letterSpacing: '0.02em', margin: 0 }}>
              SETS &<br />SPACES
            </h1>
          </div>
          <div style={{ maxWidth: 360 }}>
            <p style={{ fontFamily: 'Inter', fontSize: 15, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, margin: '0 0 24px' }}>
              Distinct sets under one open warehouse. Book a single space or take over the whole studio — every set is a blank canvas styled to your vision.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <Link href="/book?type=set" style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: '#080808', background: '#fff', padding: '12px 20px', textDecoration: 'none' }}>
                BOOK A SET ↗
              </Link>
              <Link href="/book?type=studio" style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.7)', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', padding: '12px 20px', textDecoration: 'none' }}>
                FULL BUYOUT ↗
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Stats bar */}
      <section style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        {[
          { value: loading ? '—' : String(sets.length), label: 'DISTINCT SETS' },
          { value: `$${minRate}`, label: 'STARTING / HR' },
          { value: '10K+', label: 'SQ FT TOTAL' },
          { value: '9AM–10PM', label: 'DAILY HOURS' },
        ].map((s, i) => (
          <div key={i} style={{ padding: isMobile ? '22px 20px' : '32px 40px', borderLeft: i > 0 ? '1px solid rgba(255,255,255,0.06)' : 'none' }}>
            <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 40, color: '#fff', letterSpacing: '0.02em', lineHeight: 1 }}>{s.value}</div>
            <div style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', marginTop: 8 }}>{s.label}</div>
          </div>
        ))}
      </section>

      {/* Standard sets grid */}
      <section style={{ padding: isMobile ? '52px 20px' : '80px 40px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ marginBottom: 48 }}>
            <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.3)', marginBottom: 12 }}>SHARED STUDIO — ${minRate}/HR EACH</div>
            <h2 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(36px, 5vw, 60px)', color: '#fff', letterSpacing: '0.02em', margin: 0 }}>INDIVIDUAL SETS</h2>
          </div>

          {loading ? (
            <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.4)', padding: '40px 0' }}>Loading sets…</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 2, background: 'rgba(255,255,255,0.04)' }}>
              {standard.map(set => (
                <SetCard key={set.id} set={set} num={numFor(set)} />
              ))}
            </div>
          )}

          <div style={{ marginTop: 16, fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.3)', lineHeight: 1.6 }}>
            Each set includes one Amaran 200x LED light. Additional lights available for $25/each. Up to 5 people per set.
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
            <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.3)', marginBottom: 12 }}>FULL WAREHOUSE — ${buyoutRate} FLAT RATE</div>
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
                  FULL STUDIO<br />TAKEOVER
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 1.7, margin: 0 }}>
                  {STUDIO.desc}
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  {[
                    { label: 'CAPACITY', value: STUDIO.capacity },
                    { label: 'SPACE', value: STUDIO.sqft },
                    { label: 'INCLUDES', value: 'All sets + Studio One' },
                    { label: 'RATE', value: `$${buyoutRate} flat` },
                  ].map(d => (
                    <div key={d.label}>
                      <div style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>{d.label}</div>
                      <div style={{ fontFamily: 'Inter', fontSize: 13, color: '#fff' }}>{d.value}</div>
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {STUDIO.tags.map(tag => (
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
          All bookings require 48hr advance notice. Cancellations within 48hrs are non-refundable.
          <br />
          Text us at (832) 408-1631 with questions.
        </div>
        <Link href="/book" style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: '#080808', background: '#fff', padding: '12px 24px', textDecoration: 'none' }}>
          BOOK NOW
        </Link>
      </section>
    </main>
  )
}
