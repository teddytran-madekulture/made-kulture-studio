'use client'
import { useState, useEffect, type CSSProperties } from 'react'
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
  gallery?: string[]
  allow_offsite: boolean
}

// Per-card image carousel: shows the hero, with arrows + dots when there are
// multiple photos. Falls back to a placeholder when there are none.
function GearImage({ gear }: { gear: Gear }) {
  const imgs = (gear.gallery && gear.gallery.length) ? gear.gallery : (gear.image_url ? [gear.image_url] : [])
  const [idx, setIdx] = useState(0)
  const arrow: CSSProperties = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', width: 30, height: 30, border: 'none', background: 'rgba(0,0,0,0.45)', color: '#fff', fontSize: 20, lineHeight: '30px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }
  if (!imgs.length) {
    return <div style={{ aspectRatio: '4 / 3', background: '#111', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <span style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 16, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.18)' }}>MADE KULTURE</span>
    </div>
  }
  const go = (d: number) => setIdx(i => (i + d + imgs.length) % imgs.length)
  return (
    <div style={{ position: 'relative', aspectRatio: '4 / 3', background: '#111', overflow: 'hidden' }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={imgs[idx]} alt={gear.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      {imgs.length > 1 && (
        <>
          <button aria-label="Previous photo" onClick={() => go(-1)} style={{ ...arrow, left: 0 }}>‹</button>
          <button aria-label="Next photo" onClick={() => go(1)} style={{ ...arrow, right: 0 }}>›</button>
          <div style={{ position: 'absolute', bottom: 8, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 5 }}>
            {imgs.map((_, i) => (
              <span key={i} onClick={() => setIdx(i)} style={{ width: 6, height: 6, borderRadius: '50%', cursor: 'pointer', background: i === idx ? '#fff' : 'rgba(255,255,255,0.4)' }} />
            ))}
          </div>
        </>
      )}
    </div>
  )
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
                      {/* Image carousel or placeholder */}
                      <GearImage gear={g} />
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
