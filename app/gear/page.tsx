'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import SiteNav from '@/components/SiteNav'
import { useIsMobile } from '@/lib/use-is-mobile'

interface Gear {
  id: string
  name: string
  rate: number
  category: string
  quantity: number
  description: string | null
  image_url: string | null
  allow_offsite: boolean
}

const CATEGORY_LABELS: Record<string, string> = {
  lighting:        'Lighting',
  modifier:        'Modifiers',
  special_effects: 'Special Effects',
  camera:          'Camera',
}
const CATEGORY_ORDER = ['lighting', 'modifier', 'special_effects', 'camera']

export default function GearPage() {
  const [gear, setGear]       = useState<Gear[]>([])
  const [loading, setLoading] = useState(true)
  const isMobile = useIsMobile()

  useEffect(() => {
    fetch('/api/equipment')
      .then(r => r.json())
      .then(d => setGear(d.equipment ?? []))
      .catch(() => setGear([]))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
      {/* Nav */}
      <SiteNav active="gear" />

      {/* Header */}
      <div style={{ padding: isMobile ? '110px 20px 28px' : '128px 40px 40px', maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: isMobile ? 44 : 64, letterSpacing: '0.02em', lineHeight: 1 }}>EQUIPMENT</div>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', maxWidth: 640, marginTop: 16, lineHeight: 1.6 }}>
          Everything available to rent in-studio, with pricing. Add any of it to your session during booking — no need to reserve gear here.
        </p>
        <Link href="/book" style={{ display: 'inline-block', marginTop: 20, background: '#fff', color: '#080808', padding: '12px 24px', textDecoration: 'none', fontFamily: 'Inter', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em' }}>
          BOOK A SESSION ↗
        </Link>
      </div>

      {/* Catalog */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '0 20px 80px' : '0 40px 120px' }}>
        {loading ? (
          <div style={{ padding: 80, textAlign: 'center', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.15em', fontSize: 12 }}>LOADING GEAR…</div>
        ) : gear.length === 0 ? (
          <div style={{ padding: 80, textAlign: 'center', color: 'rgba(255,255,255,0.4)' }}>No equipment listed right now.</div>
        ) : (
          CATEGORY_ORDER.map(cat => {
            const items = gear.filter(g => g.category === cat)
            if (!items.length) return null
            return (
              <div key={cat} style={{ marginBottom: 56 }}>
                <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 600, letterSpacing: '0.2em', color: '#d4a843', marginBottom: 20 }}>
                  {(CATEGORY_LABELS[cat] || cat).toUpperCase()}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 20 }}>
                  {items.map(g => (
                    <div key={g.id} id={g.id} style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.06)', overflow: 'hidden', display: 'flex', flexDirection: 'column', scrollMarginTop: 90 }}>
                      {/* Image or placeholder */}
                      <div style={{ aspectRatio: '4 / 3', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                        {g.image_url
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={g.image_url} alt={g.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          : <span style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 16, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.18)' }}>MADE KULTURE</span>}
                      </div>
                      <div style={{ padding: 20, display: 'flex', flexDirection: 'column', flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
                          <div style={{ fontFamily: 'Inter', fontSize: 15, fontWeight: 500, lineHeight: 1.3 }}>{g.name}</div>
                          {g.allow_offsite && <span style={{ flexShrink: 0, fontSize: 9, letterSpacing: '0.12em', color: '#d4a843', border: '1px solid rgba(212,168,67,0.3)', padding: '2px 6px' }}>OFF-SITE OK</span>}
                        </div>
                        {g.description && <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.55, marginBottom: 16 }}>{g.description}</p>}
                        <div style={{ marginTop: 'auto', display: 'flex', alignItems: 'baseline', gap: 8 }}>
                          <span style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 30, letterSpacing: '0.02em' }}>${g.rate}</span>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>/ booking</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })
        )}

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 40, textAlign: 'center' }}>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginBottom: 16 }}>Ready to shoot? Add any of this gear to your session at checkout.</p>
          <Link href="/book" style={{ display: 'inline-block', background: '#fff', color: '#080808', padding: '13px 28px', textDecoration: 'none', fontFamily: 'Inter', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em' }}>
            BOOK A SESSION ↗
          </Link>
        </div>
      </div>
    </div>
  )
}
