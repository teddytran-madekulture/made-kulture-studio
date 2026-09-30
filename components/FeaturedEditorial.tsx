'use client'
// The Featured Editorial on the home page ("Built for the Obsessed" left
// column). A customer's shoot, shown UNCROPPED: portrait photos sit in a 3:4
// frame on a dark mat (desktop) or full-bleed (phone), slowly crossfading,
// with title + byline + a CREDITS toggle and a link to the Instagram post.
// Data: lib/featured-editorial.ts. Editor: /admin/website/editorial.
import { useEffect, useState } from 'react'
import { handleUrl, type FeaturedEditorial as FE } from '@/lib/featured-editorial'

export default function FeaturedEditorial({ e, isMobile }: { e: FE; isMobile: boolean }) {
  const [i, setI] = useState(0)
  const [paused, setPaused] = useState(false)
  const [showCredits, setShowCredits] = useState(false)
  const n = e.photos.length

  useEffect(() => {
    if (n < 2 || paused) return
    // Respect reduced-motion: no auto-advance, the dots still work.
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
    const t = setInterval(() => setI(x => (x + 1) % n), Math.max(3, e.intervalSec) * 1000)
    return () => clearInterval(t)
  }, [n, paused, e.intervalSec])

  const byline = e.credits[0]
  const frame = (
    <div
      onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
      style={isMobile
        ? { position: 'relative', width: '100%', aspectRatio: '3 / 4', overflow: 'hidden', background: '#0b0b0b' }
        : { position: 'relative', height: '100%', aspectRatio: '3 / 4', maxWidth: '100%', overflow: 'hidden', background: '#0b0b0b', boxShadow: '0 30px 80px rgba(0,0,0,0.55)' }}
    >
      {e.photos.map((src, k) => (
        <img key={src} src={src} alt={e.title ? `${e.title}, photo ${k + 1} of ${n}` : ''} loading={k === 0 ? 'eager' : 'lazy'} draggable={false}
          onContextMenu={ev => ev.preventDefault()}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: k === i ? 1 : 0, transition: 'opacity 1.4s ease' }} />
      ))}

      {/* Credits panel — slides up over the photo */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, padding: '48px 22px 20px',
        background: 'linear-gradient(to top, rgba(0,0,0,0.92) 55%, rgba(0,0,0,0))',
        transform: showCredits ? 'translateY(0)' : 'translateY(101%)', transition: 'transform 0.35s ease',
      }}>
        {e.credits.map((c, k) => (
          <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '5px 0', fontFamily: 'Inter, sans-serif', fontSize: 12 }}>
            <span style={{ color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 10 }}>{c.role}</span>
            {c.handle
              ? <a href={handleUrl(c.handle)} target="_blank" rel="noopener noreferrer" style={{ color: '#fff', textDecoration: 'none' }}>@{c.handle}</a>
              : <span />}
          </div>
        ))}
        {e.setName && (
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, padding: '5px 0', fontFamily: 'Inter, sans-serif', fontSize: 12 }}>
            <span style={{ color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase', fontSize: 10 }}>Shot on</span>
            <span style={{ color: '#d4a843' }}>{e.setName}</span>
          </div>
        )}
      </div>
    </div>
  )

  const caption = (
    <div style={{ width: '100%', maxWidth: isMobile ? undefined : 'none', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, padding: isMobile ? '18px 20px 28px' : '18px 0 0' }}>
      <div style={{ minWidth: 0 }}>
        <div className="label" style={{ fontSize: 10, marginBottom: 6 }}>FEATURED EDITORIAL{e.setName ? ` · ${e.setName.toUpperCase()}` : ''}</div>
        <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 24, color: '#fff', lineHeight: 1.05, letterSpacing: '0.02em' }}>
          {e.title || 'Untitled'}{e.subtitle && <span style={{ color: 'rgba(255,255,255,0.4)' }}> — {e.subtitle}</span>}
        </div>
        {byline?.handle && (
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.55)', marginTop: 6 }}>
            {byline.role || 'By'}{' '}
            <a href={handleUrl(byline.handle)} target="_blank" rel="noopener noreferrer" style={{ color: '#fff', textDecoration: 'none' }}>@{byline.handle}</a>
          </div>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 10, flexShrink: 0 }}>
        {n > 1 && (
          <div style={{ display: 'flex', gap: 6 }}>
            {e.photos.map((_, k) => (
              <button key={k} onClick={() => setI(k)} aria-label={`Photo ${k + 1}`}
                style={{ width: k === i ? 18 : 6, height: 6, borderRadius: 3, border: 'none', padding: 0, cursor: 'pointer', background: k === i ? '#fff' : 'rgba(255,255,255,0.25)', transition: 'width 0.3s, background 0.3s' }} />
            ))}
          </div>
        )}
        <div style={{ display: 'flex', gap: 14 }}>
          {e.credits.length > 0 && (
            <button onClick={() => setShowCredits(v => !v)} className="label"
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 10, color: showCredits ? '#d4a843' : 'rgba(255,255,255,0.6)' }}>
              CREDITS {showCredits ? '−' : '+'}
            </button>
          )}
          {e.postUrl && (
            <a href={e.postUrl} target="_blank" rel="noopener noreferrer" className="label" style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}>VIEW POST ↗</a>
          )}
        </div>
      </div>
    </div>
  )

  if (isMobile) return <div style={{ width: '100%' }}>{frame}{caption}</div>

  // Desktop: the column's height comes from the copy on the right; the frame
  // fills it (minus the mat) at 3:4, so nothing is cropped.
  return (
    <div style={{ position: 'absolute', inset: '56px 56px 40px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
      <div style={{ flex: 1, minHeight: 0, width: '100%', display: 'flex', justifyContent: 'center' }}>{frame}</div>
      <div style={{ width: '100%', maxWidth: 560 }}>{caption}</div>
    </div>
  )
}
