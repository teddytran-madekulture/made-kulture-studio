'use client'

import { useState, useEffect } from 'react'

// Gallery for a set landing page. Shows each photo at its full, uncropped
// portrait aspect (CSS multi-column masonry), and opens a click-to-enlarge
// lightbox with keyboard + prev/next navigation. Rendered as a client
// component so the parent /sets/[slug] page can stay server-rendered.
export default function SetGallery({ images, name }: { images: string[]; name: string }) {
  const [open, setOpen] = useState<number | null>(null)

  useEffect(() => {
    if (open === null) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(null)
      else if (e.key === 'ArrowRight') setOpen(o => (o === null ? o : (o + 1) % images.length))
      else if (e.key === 'ArrowLeft') setOpen(o => (o === null ? o : (o - 1 + images.length) % images.length))
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, images.length])

  if (!images.length) return null

  const arrowBtn: React.CSSProperties = {
    position: 'absolute', top: '50%', transform: 'translateY(-50%)',
    background: 'rgba(0,0,0,0.35)', border: '1px solid rgba(255,255,255,0.25)', color: '#fff',
    width: 48, height: 48, fontSize: 26, lineHeight: 1, cursor: 'pointer', display: 'flex',
    alignItems: 'center', justifyContent: 'center',
  }

  return (
    <div style={{ marginTop: 40 }}>
      <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>GALLERY</div>

      {/* Masonry — full portrait, nothing cropped */}
      <div style={{ columnWidth: 250, columnGap: 8 }}>
        {images.map((src, i) => (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={i}
            src={src}
            alt={`${name} — photo ${i + 2} at Made Kulture, Houston`}
            loading="lazy"
            onClick={() => setOpen(i)}
            style={{ width: '100%', height: 'auto', display: 'block', marginBottom: 8, cursor: 'zoom-in', breakInside: 'avoid' }}
          />
        ))}
      </div>

      {/* Lightbox */}
      {open !== null && (
        <div
          onClick={() => setOpen(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(6,6,6,0.94)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, cursor: 'zoom-out' }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setOpen(null) }}
            aria-label="Close"
            style={{ position: 'absolute', top: 18, right: 22, background: 'none', border: 'none', color: '#fff', fontSize: 34, lineHeight: 1, cursor: 'pointer' }}
          >×</button>

          {images.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setOpen((open - 1 + images.length) % images.length) }}
              aria-label="Previous"
              style={{ ...arrowBtn, left: 20 }}
            >‹</button>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={images[open]}
            alt={`${name} — enlarged photo ${open + 2}`}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '92vw', maxHeight: '88vh', objectFit: 'contain', cursor: 'default', boxShadow: '0 24px 70px rgba(0,0,0,0.6)' }}
          />

          {images.length > 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setOpen((open + 1) % images.length) }}
              aria-label="Next"
              style={{ ...arrowBtn, right: 20 }}
            >›</button>
          )}

          <div style={{ position: 'absolute', bottom: 20, left: 0, right: 0, textAlign: 'center', color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter', fontSize: 12, letterSpacing: '0.12em' }}>
            {open + 1} / {images.length}
          </div>
        </div>
      )}
    </div>
  )
}
