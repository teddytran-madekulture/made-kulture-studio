'use client'
// "Submissions" row on the directory home (2026-10-08). The same calls as
// /submissions (lib/open-calls-server.ts): limited-run open calls as cards —
// a call in its vote leads and is outlined in gold, because voting is the
// directory's job — and the always-open Featured Editorial as one line under
// them. Every link goes to /submissions#<slug>, which opens that call's panel.
import Link from 'next/link'

export type SubmissionCall = {
  slug: string; title: string; tagline: string | null; cover: string | null
  rolling: boolean; phase: string; status: string; hasPrize: boolean
}

const muted = 'rgba(var(--t-fg-rgb), calc(0.55 * var(--t-a)))'
const hair = '1px solid rgba(var(--t-fg-rgb), calc(0.1 * var(--t-a)))'
const mono: React.CSSProperties = { fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, letterSpacing: '0.18em', textTransform: 'uppercase' }
const btn = (filled: boolean): React.CSSProperties => ({
  ...mono, display: 'inline-block', padding: '12px 16px', textDecoration: 'none', textAlign: 'center',
  border: '1px solid var(--t-fg)', background: filled ? 'var(--t-fg)' : 'transparent', color: filled ? 'var(--t-on-fg)' : 'var(--t-fg)',
})
const clamp = (n: number): React.CSSProperties => ({ display: '-webkit-box', WebkitLineClamp: n, WebkitBoxOrient: 'vertical', overflow: 'hidden' })
const titleCase = (s: string) => s.toLowerCase().replace(/(^|\s)\S/g, m => m.toUpperCase())

export default function SubmissionsRow({ calls, isMobile, serifClass, sectionStyle, head, listed }: {
  calls: SubmissionCall[]; isMobile: boolean; serifClass: string; sectionStyle: React.CSSProperties; head: React.ReactNode; listed: boolean
}) {
  const limited = calls.filter(c => !c.rolling)
  const always = calls.find(c => c.rolling)
  if (!limited.length && !always) return null

  return (
    <section style={sectionStyle}>
      {head}
      {limited.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : `repeat(${Math.min(limited.length, 3)}, 1fr)`, gap: 16 }}>
          {limited.map(c => {
            const voting = c.phase === 'voting'
            const tba = c.status === 'TBA'
            const cta = voting ? (listed ? 'Vote now' : 'See the vote') : c.phase === 'open' ? 'Submit your series' : tba ? 'Details soon' : 'View'
            return (
              <Link key={c.slug} href={`/submissions#${c.slug}`} style={{ display: 'grid', gridTemplateColumns: '120px 1fr', textDecoration: 'none', color: 'var(--t-fg)', background: 'var(--t-surface)', border: voting ? '1px solid var(--t-gold)' : hair, borderRadius: 8, overflow: 'hidden', minHeight: 150 }}>
                <div style={{ position: 'relative', background: 'var(--t-surface-hi)' }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {c.cover && <img src={c.cover} alt="" loading="lazy" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', objectPosition: 'center 30%', opacity: tba ? 0.5 : 1 }} />}
                </div>
                <div style={{ padding: '16px 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ ...mono, fontSize: 10, color: voting ? 'var(--t-gold)' : muted }}>{voting ? '● ' : ''}{c.status}</div>
                  <div className={serifClass} style={{ fontSize: 28, lineHeight: 1, fontStyle: 'italic' }}>{titleCase(c.title)}</div>
                  {c.tagline && <div style={{ fontSize: 13, color: muted, lineHeight: 1.5, ...clamp(2) }}>{c.tagline}</div>}
                  <div style={{ marginTop: 'auto', paddingTop: 6, ...mono, fontSize: 10.5, color: 'var(--t-fg)' }}>
                    {cta}{!tba && ' →'}{c.hasPrize && !tba && <span style={{ color: muted }}> · prize</span>}
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
      {always && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, flexWrap: 'wrap', marginTop: limited.length ? 16 : 0, padding: '16px 18px', border: hair, borderRadius: 8 }}>
          <div style={{ minWidth: 0, flex: '1 1 320px' }}>
            <div style={{ ...mono, fontSize: 10, color: 'var(--t-gold)', marginBottom: 4 }}>Always open · any set</div>
            <div style={{ fontSize: 15, lineHeight: 1.5 }}>Shot something here you&rsquo;d put your name on? Submit it for <b>{always.title}</b>.</div>
          </div>
          <Link href={`/submissions#${always.slug}`} style={btn(false)}>Submit your series</Link>
        </div>
      )}
    </section>
  )
}
