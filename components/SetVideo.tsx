'use client'

import { useEffect, useRef, useState } from 'react'

// Per-set video on the public set pages (2026-09-15).
//
// ⚠️ MUTED IS NOT A STYLE CHOICE. Every browser blocks autoplay with sound, and
// a <video autoPlay> carrying an audible track does not "start quietly" — it
// does not start AT ALL. So it opens muted and the toggle is the only thing
// that ever unmutes it.
//
// ⚠️ playsInline is load-bearing on iOS. Without it Safari throws the video
// fullscreen the instant it plays, hijacking the page on every iPhone visit.
//
// ⚠️ poster is the set's own hero photo, so what's on screen before the first
// byte of video lands is the image the page would have shown anyway. A black
// box reads as broken on a slow connection, which is most of them in-studio.
//
// ⚠️ H.264 MP4 ONLY. VP9-in-MP4 plays fine in Chrome and shows NOTHING on
// Safari/iOS — no error, no fallback, no clue. Same warning lives on the
// upload control in SetsCatalogManager; keep the two in step.
//
// ⚠️ The clip is only fetched once it scrolls into view. These are 9:16 phone
// clips at a few MB each; a `block` variant sits below the fold, and making
// every visitor pay for it unviewed is the same class of mistake as the
// jukebox's 5-second poll. See [[vercel-cpu-jukebox-polling]].

type Props = {
  src: string
  poster?: string | null
  name: string
  variant: 'hero' | 'block'
}

export default function SetVideo({ src, poster, name, variant }: Props) {
  const ref = useRef<HTMLVideoElement>(null)
  const [muted, setMuted] = useState(true)
  const [visible, setVisible] = useState(variant === 'hero')

  useEffect(() => {
    if (visible) return
    const v = ref.current
    if (!v) return
    // No IntersectionObserver (old Safari) ⇒ load it rather than never showing
    // the video at all. Degrading to "works, costs bandwidth" beats "blank".
    if (typeof IntersectionObserver === 'undefined') { setVisible(true); return }
    const io = new IntersectionObserver(entries => {
      if (entries.some(e => e.isIntersecting)) { setVisible(true); io.disconnect() }
    }, { rootMargin: '200px' })
    io.observe(v)
    return () => io.disconnect()
  }, [visible])

  function toggleSound() {
    const v = ref.current
    if (!v) return
    // Drive the ELEMENT, not just React state — `muted` is a property that does
    // not reliably follow a re-render, so setting state alone can leave the
    // button saying one thing and the video doing another.
    v.muted = !v.muted
    setMuted(v.muted)
    if (!v.muted) v.play().catch(() => {})
  }

  const videoStyle: React.CSSProperties = variant === 'hero'
    ? { position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.85 }
    : { display: 'block', width: '100%', height: '100%', objectFit: 'contain', background: '#000' }

  const video = (
    <video
      ref={ref}
      // src is set only once in view; poster still paints immediately.
      src={visible ? src : undefined}
      poster={poster || undefined}
      autoPlay
      loop
      muted
      playsInline
      preload={variant === 'hero' ? 'metadata' : 'none'}
      aria-label={`${name} — set video`}
      style={videoStyle}
    />
  )

  const soundBtn = (
    <button
      onClick={toggleSound}
      aria-label={muted ? 'Unmute video' : 'Mute video'}
      style={{
        position: 'absolute', bottom: 14, right: 14, width: 38, height: 38,
        display: 'grid', placeItems: 'center', cursor: 'pointer',
        borderRadius: '50%', border: '1px solid rgba(255,255,255,0.25)',
        background: 'rgba(8,8,8,0.55)', backdropFilter: 'blur(6px)', color: '#fff',
        padding: 0, lineHeight: 0,
      }}
    >
      {/* Inline SVG — lucide-react is NOT installed in this repo. */}
      {muted ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M11 5 6 9H3v6h3l5 4V5z" /><path d="m22 9-6 6" /><path d="m16 9 6 6" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
          <path d="M11 5 6 9H3v6h3l5 4V5z" /><path d="M16 8.5a4 4 0 0 1 0 7" /><path d="M19 6a7.5 7.5 0 0 1 0 12" />
        </svg>
      )}
    </button>
  )

  if (variant === 'hero') {
    return <>{video}{soundBtn}</>
  }

  return (
    <div style={{ marginTop: 2, background: 'rgba(255,255,255,0.04)', padding: 2 }}>
      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', padding: '14px 18px 12px' }}>
        {name.toUpperCase()} — ON CAMERA
      </div>
      {/* ⚠️ calc(N * var(--svh)), never raw vh: globals.css zooms desktop 1.25x,
          so a raw 80vh paints 25% too tall and overflows the window. */}
      <div style={{ position: 'relative', background: '#000', maxHeight: 'calc(80 * var(--svh))', height: 'calc(80 * var(--svh))' }}>
        {video}
        {soundBtn}
      </div>
    </div>
  )
}
