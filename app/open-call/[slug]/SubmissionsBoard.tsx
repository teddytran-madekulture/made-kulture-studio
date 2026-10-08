'use client'

// /submissions as a board of TILES (Teddy, 2026-10-08: calls shouldn't be huge
// sections — more will be added). A tile opens a side panel with the call's
// steps, prize and form. The panel is deep-linkable: /submissions#<slug>.

import { useEffect, useState } from 'react'
import type { OpenCallPhase } from '@/lib/open-calls'
import OpenCallClient from './OpenCallClient'
import VotePanel from './VotePanel'

export interface BoardCall {
  slug: string; title: string; tagline: string | null; prize: string | null; cover: string | null
  kind: string; status: string; phase: OpenCallPhase; tba: boolean
  steps: { n: string; h: string; p: string }[]
  setName: string | null; setSlug: string | null; maxImages: number; closes: string | null; rolling: boolean
}

const GOLD = '#c9b27e'
const mono = '"JetBrains Mono", ui-monospace, monospace'
const anton = 'Anton, "Bebas Neue", sans-serif'

export default function SubmissionsBoard({ calls }: { calls: BoardCall[] }) {
  const [open, setOpen] = useState<string | null>(null)

  // Hash in → panel open (shared links, the email, old /open-call/<slug> redirects).
  useEffect(() => {
    const read = () => {
      const h = decodeURIComponent(window.location.hash.replace(/^#/, ''))
      setOpen(calls.some(c => c.slug === h) ? h : null)
    }
    read()
    window.addEventListener('hashchange', read)
    return () => window.removeEventListener('hashchange', read)
  }, [calls])

  const show = (slug: string | null) => {
    setOpen(slug)
    const url = slug ? `#${slug}` : window.location.pathname + window.location.search
    window.history.replaceState(null, '', url)
  }

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') show(null) }
    window.addEventListener('keydown', onKey)
    return () => { document.body.style.overflow = prev; window.removeEventListener('keydown', onKey) }
  }, [open]) // eslint-disable-line react-hooks/exhaustive-deps

  const current = calls.find(c => c.slug === open) ?? null
  const rolling = calls.filter(c => c.rolling)
  const limited = calls.filter(c => !c.rolling)

  return (
    <>
      <section style={{ maxWidth: 1100, margin: '0 auto', padding: '8px 20px 96px' }}>
        {/* The always-open call is not a tile — it's the standing door, so it
            sits above the open calls as its own strip (Teddy, 2026-10-08). */}
        {rolling.map(c => <Strip key={c.slug} c={c} onOpen={() => show(c.slug)} />)}

        {limited.length > 0 && (
          <>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.55)', margin: rolling.length ? '48px 0 14px' : '0 0 14px' }}>
              OPEN CALLS · LIMITED-RUN SETS
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
              {limited.map(c => <Tile key={c.slug} c={c} onOpen={() => show(c.slug)} />)}
            </div>
          </>
        )}
      </section>
      {current && <Panel c={current} onClose={() => show(null)} />}
    </>
  )
}

function Strip({ c, onOpen }: { c: BoardCall; onOpen: () => void }) {
  return (
    <div style={{ border: '1px solid rgba(201,178,126,0.35)', background: 'linear-gradient(100deg, rgba(201,178,126,0.10), rgba(201,178,126,0.02) 60%)', padding: '26px 24px', display: 'flex', gap: 24, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
      <div style={{ flex: '1 1 420px', minWidth: 0 }}>
        <div style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: '0.2em', color: GOLD, marginBottom: 10 }}>ALWAYS OPEN · ANY SET · NO DEADLINE</div>
        <div style={{ fontFamily: anton, fontSize: 'clamp(30px, 4.5vw, 44px)', lineHeight: 0.95, letterSpacing: '0.01em' }}>{c.title.toUpperCase()}</div>
        {c.tagline && <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14.5, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6, margin: '10px 0 0', maxWidth: 620 }}>{c.tagline}</p>}
      </div>
      <button onClick={onOpen} style={{ background: '#fff', color: '#000', border: 'none', padding: '16px 24px', fontFamily: mono, fontSize: 12, fontWeight: 700, letterSpacing: '0.16em', cursor: 'pointer', flexShrink: 0 }}>
        SUBMIT YOUR SERIES →
      </button>
    </div>
  )
}

function Tile({ c, onOpen }: { c: BoardCall; onOpen: () => void }) {
  const [hover, setHover] = useState(false)
  return (
    <button onClick={onOpen} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      style={{ position: 'relative', aspectRatio: '4 / 5', border: '1px solid rgba(255,255,255,0.1)', background: '#111', padding: 0, cursor: 'pointer', overflow: 'hidden', textAlign: 'left', color: '#fff' }}>
      {c.cover && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={c.cover} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%', opacity: c.tba ? 0.45 : 0.9, transform: hover ? 'scale(1.04)' : 'scale(1)', transition: 'transform .6s ease' }} />
      )}
      {!c.cover && (
        <div style={{ position: 'absolute', inset: 0, background: 'radial-gradient(120% 90% at 30% 20%, #1d1d22 0%, #0b0b0d 70%)' }} />
      )}
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(8,8,8,0.15) 30%, rgba(8,8,8,0.92) 100%)' }} />
      <span style={{ position: 'absolute', top: 12, left: 12, fontFamily: mono, fontSize: 10, letterSpacing: '0.16em', background: c.tba ? 'rgba(255,255,255,0.12)' : GOLD, color: c.tba ? '#fff' : '#000', padding: '5px 8px' }}>
        {c.status}
      </span>
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 16 }}>
        <div style={{ fontFamily: mono, fontSize: 10, letterSpacing: '0.18em', color: GOLD, marginBottom: 8 }}>{c.kind}</div>
        <div style={{ fontFamily: anton, fontSize: 32, lineHeight: 0.95, letterSpacing: '0.01em' }}>{c.title.toUpperCase()}</div>
        {c.prize && !c.tba && <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12.5, color: 'rgba(255,255,255,0.7)', marginTop: 8 }}>Directory vote · winner gets a prize</div>}
        <div style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: '0.16em', marginTop: 12, color: hover ? GOLD : 'rgba(255,255,255,0.75)' }}>
          {c.tba ? 'DETAILS SOON' : c.phase === 'open' ? 'VIEW & SUBMIT →' : c.phase === 'voting' ? 'SEE THE SHORTLIST & VOTE →' : 'VIEW →'}
        </div>
      </div>
    </button>
  )
}

function Panel({ c, onClose }: { c: BoardCall; onClose: () => void }) {
  return (
    <div role="dialog" aria-modal="true" aria-label={c.title} style={{ position: 'fixed', inset: 0, zIndex: 60, display: 'flex', justifyContent: 'flex-end' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.65)' }} />
      <div style={{ position: 'relative', width: 'min(780px, 100%)', height: 'var(--vh-full, 100vh)', overflowY: 'auto', background: '#080808', borderLeft: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}>
        <button onClick={onClose} aria-label="Close"
          style={{ position: 'sticky', top: 12, float: 'right', marginRight: 12, zIndex: 2, background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', width: 40, height: 40, cursor: 'pointer', fontSize: 16 }}>✕</button>

        <div style={{ position: 'relative', minHeight: c.cover ? 300 : 0, display: 'flex', alignItems: 'flex-end' }}>
          {c.cover && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={c.cover} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%' }} />
          )}
          {c.cover && <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(8,8,8,0.1) 30%, rgba(8,8,8,0.95) 100%)' }} />}
          <div style={{ position: 'relative', padding: c.cover ? '0 24px 24px' : '64px 24px 8px' }}>
            <div style={{ fontFamily: mono, fontSize: 11, letterSpacing: '0.2em', color: GOLD, marginBottom: 10 }}>{c.kind} · {c.status}</div>
            <h2 style={{ fontFamily: anton, fontSize: 'clamp(40px, 7vw, 64px)', lineHeight: 0.92, margin: 0 }}>{c.title.toUpperCase()}</h2>
          </div>
        </div>

        <div style={{ padding: '20px 24px 0' }}>
          {c.tagline && <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 15.5, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6, margin: '0 0 20px' }}>{c.tagline}</p>}
          {c.steps.length > 0 && (
            <div style={{ display: 'grid', gap: 2, background: 'rgba(255,255,255,0.06)' }}>
              {c.steps.map(s => (
                <div key={s.n} style={{ background: '#0b0b0d', padding: '16px 18px', display: 'flex', gap: 16 }}>
                  <div style={{ fontFamily: mono, fontSize: 11, color: GOLD, letterSpacing: '0.15em', paddingTop: 4 }}>{s.n}</div>
                  <div>
                    <div style={{ fontFamily: anton, fontSize: 20, letterSpacing: '0.02em', marginBottom: 4 }}>{s.h.toUpperCase()}</div>
                    <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 13.5, color: 'rgba(255,255,255,0.55)', lineHeight: 1.55, margin: 0 }}>{s.p}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
          {c.prize && (
            <div style={{ marginTop: 2, background: 'linear-gradient(90deg, rgba(201,178,126,0.14), rgba(201,178,126,0.04))', border: '1px solid rgba(201,178,126,0.35)', padding: '16px 18px' }}>
              <div style={{ fontFamily: mono, fontSize: 10.5, letterSpacing: '0.2em', color: GOLD, marginBottom: 6 }}>THE WINNER GETS</div>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 14.5, lineHeight: 1.6 }}>{c.prize}</div>
            </div>
          )}
        </div>

        {c.phase === 'voting' && <VotePanel slug={c.slug} />}
        {!c.tba && c.phase !== 'voting' && (
          <OpenCallClient slug={c.slug} title={c.title} setName={c.setName} setSlug={c.setSlug}
            maxImages={c.maxImages} closes={c.closes} rolling={c.rolling} path={`/submissions#${c.slug}`} inPanel />
        )}
        {c.tba && <p style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, color: 'rgba(255,255,255,0.5)', padding: '20px 24px 48px' }}>Dates, details and the prize are coming soon.</p>}
      </div>
    </div>
  )
}
