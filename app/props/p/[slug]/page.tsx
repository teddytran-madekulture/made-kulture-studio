'use client'
import { useState, useEffect } from 'react'
import SiteNav from '@/components/SiteNav'
import { useIsMobile } from '@/lib/use-is-mobile'
import type { Prop } from '@/lib/props'

export default function PropDetailPage({ params }: { params: { slug: string } }) {
  const isMobile = useIsMobile()
  const [prop, setProp] = useState<Prop | null>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    fetch(`/api/props/${params.slug}`)
      .then(r => { if (!r.ok) throw new Error('nf'); return r.json() })
      .then(d => setProp(d.prop))
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false))
  }, [params.slug])

  const gallery = (prop?.gallery && prop.gallery.length ? prop.gallery : (prop?.image_url ? [prop.image_url] : []))
  const main = gallery[idx] ?? gallery[0]

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#fff' }}>
      <SiteNav active="props" />

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: isMobile ? '96px 20px 80px' : '120px 40px 120px' }}>
        {/* Breadcrumb */}
        <div style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)', marginBottom: 28 }}>
          <a href="/props" style={{ color: 'rgba(255,255,255,0.55)', textDecoration: 'none' }}>PROPS</a>
          <span style={{ margin: '0 10px', color: 'rgba(255,255,255,0.25)' }}>/</span>
          <span style={{ color: '#fff' }}>{prop ? prop.name.toUpperCase() : ''}</span>
        </div>

        {loading ? (
          <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13, letterSpacing: '0.1em' }}>LOADING…</div>
        ) : notFound || !prop ? (
          <div style={{ color: 'rgba(255,255,255,0.5)', fontSize: 15 }}>
            This prop isn&apos;t available. <a href="/props" style={{ color: '#d4a843' }}>Back to all props</a>.
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1.15fr 0.85fr', gap: isMobile ? 28 : 56, alignItems: 'start' }}>
            {/* Gallery */}
            <div>
              <div style={{ position: 'relative', width: '100%', aspectRatio: '1 / 1', background: '#141414', overflow: 'hidden', border: '1px solid rgba(255,255,255,0.06)' }}>
                {main ? (
                  <img src={main} alt={prop.name} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'rgba(255,255,255,0.15)', fontSize: 12, letterSpacing: '0.15em' }}>NO PHOTO</div>
                )}
                {gallery.length > 1 && (
                  <div style={{ position: 'absolute', bottom: 10, right: 10, background: 'rgba(0,0,0,0.6)', color: '#fff', fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 10, letterSpacing: '0.1em', padding: '4px 8px' }}>
                    {idx + 1} / {gallery.length}
                  </div>
                )}
              </div>

              {gallery.length > 1 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 8, marginTop: 10 }}>
                  {gallery.map((g, i) => (
                    <button key={g} onClick={() => setIdx(i)} style={{
                      position: 'relative', aspectRatio: '1 / 1', background: '#141414', overflow: 'hidden', cursor: 'pointer', padding: 0,
                      border: i === idx ? '2px solid #d4a843' : '1px solid rgba(255,255,255,0.12)',
                    }}>
                      <img src={g} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }} />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Info */}
            <div style={{ position: isMobile ? 'static' : 'sticky', top: 120 }}>
              {prop.category && (
                <div style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.45)', marginBottom: 12 }}>{prop.category.toUpperCase()}</div>
              )}
              <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: isMobile ? 40 : 54, letterSpacing: '0.01em', margin: 0, lineHeight: 1.02 }}>{prop.name}</h1>

              {prop.needs_repair && (
                <div style={{ display: 'inline-block', marginTop: 16, background: 'rgba(249,115,22,0.9)', color: '#080808', fontFamily: 'Inter', fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', padding: '4px 9px' }}>NEEDS REPAIR</div>
              )}

              {prop.description && (
                <p style={{ fontFamily: 'Inter', fontSize: 15, color: 'rgba(255,255,255,0.6)', lineHeight: 1.7, marginTop: 20 }}>{prop.description}</p>
              )}

              <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.7, marginTop: 20 }}>
                Included with any booking — props live throughout the studio and are first come, first served during shared hours. Style your set, then return items roughly where you found them.
              </p>

              <div style={{ display: 'flex', gap: 14, alignItems: 'center', marginTop: 28, flexWrap: 'wrap' }}>
                <a href="/book" style={{
                  display: 'inline-flex', alignItems: 'center', gap: 12, background: '#fff', color: '#080808',
                  padding: '13px 22px', textDecoration: 'none',
                  fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, fontWeight: 500, letterSpacing: '0.2em',
                }}>
                  BOOK THE STUDIO
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7" /><polyline points="7 7 17 7 17 17" /></svg>
                </a>
                <a href="/props" style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>← ALL PROPS</a>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
