'use client'
import { useState, useEffect } from 'react'
import SiteNav from '@/components/SiteNav'
import { useIsMobile } from '@/lib/use-is-mobile'
import type { Prop } from '@/lib/props'

export default function PropsPage() {
  const isMobile = useIsMobile()
  const [props, setProps] = useState<Prop[]>([])
  const [categories, setCategories] = useState<string[]>([])
  const [active, setActive] = useState<string>('All')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/props')
      .then(r => r.json())
      .then(d => { setProps(d.props ?? []); setCategories(d.categories ?? []) })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const shown = active === 'All' ? props : props.filter(p => p.category === active)
  const chips = ['All', ...categories]

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#fff' }}>
      <SiteNav active="props" />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '104px 20px 80px' : '128px 40px 120px' }}>
        <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>STUDIO PROPS</div>
        <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: isMobile ? 44 : 64, letterSpacing: '0.02em', margin: 0, lineHeight: 1 }}>A SINGLE PROP CAN MAKE THE SHOT</h1>
        <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.5)', maxWidth: 640, marginTop: 16, lineHeight: 1.7 }}>
          A growing directory of what&apos;s available. All props are included with the standard booking and live throughout the space — style your set as simple or elaborate as you like, then return them roughly where you found them before your session ends. Not everything is listed yet; we&apos;re always adding more.
        </p>

        {/* Category filter */}
        {chips.length > 1 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 32 }}>
            {chips.map(c => (
              <button key={c} onClick={() => setActive(c)} style={{
                background: active === c ? '#fff' : 'transparent',
                color: active === c ? '#080808' : 'rgba(255,255,255,0.55)',
                border: '1px solid rgba(255,255,255,0.18)', padding: '8px 16px', cursor: 'pointer',
                fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, letterSpacing: '0.12em',
              }}>{c.toUpperCase()}</button>
            ))}
          </div>
        )}

        {/* Grid */}
        <div style={{ marginTop: 40 }}>
          {loading ? (
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, letterSpacing: '0.1em' }}>LOADING PROPS…</div>
          ) : shown.length === 0 ? (
            <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No props listed yet — check back soon.</div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(auto-fill, minmax(240px, 1fr))', gap: isMobile ? 12 : 16 }}>
              {shown.map(p => (
                <div key={p.id} style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', background: '#141414', overflow: 'hidden' }}>
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name} loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { (e.target as HTMLImageElement).style.display = 'none' }} />
                    ) : (
                      <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.15)', fontSize: 11, letterSpacing: '0.15em' }}>NO PHOTO</div>
                    )}
                    {p.needs_repair && (
                      <div style={{ position: 'absolute', top: 8, left: 8, background: 'rgba(249,115,22,0.9)', color: '#080808', fontFamily: 'Inter', fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', padding: '3px 7px' }}>NEEDS REPAIR</div>
                    )}
                  </div>
                  <div style={{ padding: '12px 14px' }}>
                    <div style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 600, color: '#fff', lineHeight: 1.3 }}>{p.name}</div>
                    {p.category && <div style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 9, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)', marginTop: 6 }}>{p.category.toUpperCase()}</div>}
                    {p.description && <p style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5, margin: '8px 0 0' }}>{p.description}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
