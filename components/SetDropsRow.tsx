'use client'
// "Set Drops" row — limited-run sets people can reserve or book right now.
// Renders nothing when there are none, so it can sit on any page.
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface RowDrop { slug: string; name: string; tagline: string | null; hero_url: string | null; phase: string; runLabel: string; deposit: string }
const LABEL: Record<string, string> = { pre_reserve: 'RESERVE NOW', deciding: 'RESERVATIONS CLOSED', early_access: 'EARLY ACCESS', open: 'NOW BOOKING' }

export default function SetDropsRow({ isMobile }: { isMobile: boolean }) {
  const [drops, setDrops] = useState<RowDrop[]>([])
  useEffect(() => { fetch('/api/drops').then(r => r.json()).then(d => setDrops(d.drops ?? [])).catch(() => {}) }, [])
  if (!drops.length) return null
  return (
    <section style={{ padding: isMobile ? '52px 20px 44px' : '80px 40px 64px' }}>
      <div style={{ maxWidth: 1400, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 24 }}>
          <div>
            <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', color: '#c9b27e', marginBottom: 12 }}>LIMITED RUN</div>
            <h2 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(36px, 5vw, 60px)', color: '#fff', letterSpacing: '0.02em', margin: 0 }}>SET DROPS</h2>
          </div>
          <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, maxWidth: 420, margin: 0 }}>
            Sets we build only if enough of you want them. Reserve with a small deposit; if it happens, it becomes credit and you book first.
          </p>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {drops.map(d => (
            <Link key={d.slug} href={`/drops/${d.slug}`} style={{ position: 'relative', display: 'block', aspectRatio: '16 / 10', background: '#141414', overflow: 'hidden', textDecoration: 'none', color: '#fff' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {d.hero_url && <img src={d.hero_url} alt="" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', opacity: 0.75 }} />}
              <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(0,0,0,0) 35%, rgba(0,0,0,0.85) 100%)' }} />
              <div style={{ position: 'absolute', left: 20, right: 20, bottom: 18 }}>
                <div style={{ fontFamily: '"JetBrains Mono", monospace', fontSize: 10, letterSpacing: '0.18em', color: '#c9b27e' }}>{LABEL[d.phase] ?? ''}{d.phase === 'pre_reserve' ? ` · ${d.deposit} DEPOSIT` : ''}</div>
                <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, lineHeight: 0.95, marginTop: 6 }}>{d.name.toUpperCase()}</div>
                <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.65)', marginTop: 6 }}>{d.runLabel}</div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  )
}
