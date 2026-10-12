'use client'
// The ROSTER tab on a company's directory profile (migration 165) — e.g. a
// model agency's talent, synced nightly from the agency's own website.
//
// The point is to send members TO the company's site: every card's main action
// is VIEW FULL BOOK, which opens that talent's page there. Booking happens with
// the company, never through us and never with the talent directly. ASK THE
// AGENCY opens the normal 1:1 directory conversation with the company account.
//
// `preview` = the admin preview in /admin/rosters: everything renders, nothing
// messages anyone.
import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { trackNow } from '@/lib/track'
import { sizedImage, talentStats, type PublicRoster, type RosterTalent } from '@/lib/roster'

const muted = 'rgba(var(--t-fg-rgb), calc(0.55 * var(--t-a)))'
const faint = 'rgba(var(--t-fg-rgb), calc(0.12 * var(--t-a)))'

function hostOf(url: string): string {
  try { return new URL(url).host.replace(/^www\./, '') } catch { return url }
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick}
      style={{
        padding: '7px 13px', borderRadius: 999, cursor: 'pointer', fontFamily: 'Inter', fontSize: 11.5, fontWeight: 600, letterSpacing: '0.06em',
        border: `1px solid ${on ? 'var(--t-fg)' : faint}`, background: on ? 'var(--t-fg)' : 'transparent', color: on ? 'var(--t-on-fg)' : 'var(--t-fg)',
      }}>
      {children}
    </button>
  )
}

export default function RosterTab({ roster, memberId, memberName, isSelf = false, preview = false, openId = null }: {
  roster: PublicRoster; memberId: string; memberName: string; isSelf?: boolean; preview?: boolean
  /** Deep link from directory search (?talent=<id>): open this model on arrival. */
  openId?: string | null
}) {
  const router = useRouter()
  const [division, setDivision] = useState('All')
  const [city, setCity] = useState('All')
  const [open, setOpen] = useState<RosterTalent | null>(null)
  const [idx, setIdx] = useState(0)
  const [x0, setX0] = useState<number | null>(null)
  const [asking, setAsking] = useState(false)
  const [err, setErr] = useState('')

  const divisions = useMemo(() => {
    const s = new Set(roster.talent.map(t => t.division).filter(Boolean))
    return ['Women', 'Men'].filter(d => s.has(d))
  }, [roster.talent])
  // A city-limited roster (migration 167) only offers its own cities as chips —
  // a Dallas + Houston model must not bring back a DALLAS chip on a Houston roster.
  const only = roster.only_cities ?? []
  const cities = useMemo(() => {
    const n: Record<string, number> = {}
    const ok = (c: string) => !only.length || only.some(o => o.toLowerCase() === c.toLowerCase())
    roster.talent.forEach(t => t.cities.forEach(c => { if (ok(c)) n[c] = (n[c] ?? 0) + 1 }))
    return Object.keys(n).sort((a, b) => n[b] - n[a] || a.localeCompare(b))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster.talent, only.join('|')])
  const shown = roster.talent.filter(t =>
    (division === 'All' || t.division === division) && (city === 'All' || t.cities.includes(city)))

  const openCard = (t: RosterTalent) => { setOpen(t); setIdx(0); setErr('') }
  useEffect(() => {
    if (!openId) return
    const t = roster.talent.find(x => x.id === openId)
    if (t) openCard(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openId, roster.talent])
  const go = (dir: number) => { if (!open) return; const n = open.photos.length; if (n > 1) setIdx(i => ((i + dir) % n + n) % n) }

  const viewBook = (t: RosterTalent) => {
    if (!preview) trackNow('contact_click', { target_id: memberId, meta: { what: 'roster_book', talent: t.name } })
  }
  const askAgency = async () => {
    if (preview || isSelf || asking) return
    trackNow('contact_click', { target_id: memberId, meta: { what: 'roster_ask', talent: open?.name ?? '' } })
    setAsking(true); setErr('')
    const res = await fetch('/api/messages/start', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ toUserId: memberId }),
    })
    const d = await res.json().catch(() => ({}))
    setAsking(false)
    if (res.ok && d.conversationId) router.push(`/account/messages/${d.conversationId}`)
    else setErr(d.error ?? 'Could not start a conversation.')
  }

  return (
    <div>
      <style>{`
        .roster-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 18px 14px; }
        .roster-card { all: unset; cursor: pointer; display: block; }
        .roster-card .ph { position: relative; aspect-ratio: 4 / 5; overflow: hidden; background: var(--t-surface); }
        .roster-card img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; transition: opacity .35s ease, transform .6s ease; }
        .roster-card img.alt { opacity: 0; }
        @media (hover: hover) { .roster-card:hover img.alt { opacity: 1; } .roster-card:hover img { transform: scale(1.02); } }
        .roster-card:focus-visible .ph { outline: 2px solid var(--t-fg); outline-offset: 2px; }
        @media (max-width: 600px) { .roster-grid { grid-template-columns: repeat(2, 1fr); gap: 14px 8px; } }
      `}</style>

      {roster.draft && !preview && (
        <div style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 600, letterSpacing: '0.04em', color: 'var(--t-gold)', border: '1px solid rgba(var(--t-gold-rgb), 0.45)', background: 'rgba(var(--t-gold-rgb), 0.08)', borderRadius: 6, padding: '10px 12px', marginBottom: 16, lineHeight: 1.5 }}>
          DRAFT · Only you can see this roster (admin view). Members won&apos;t see it until you make it live in Admin → Company Rosters.
        </div>
      )}

      {/* Header: what this is and where it comes from */}
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 14 }}>
        <div style={{ fontFamily: 'Inter', fontSize: 13, color: muted, lineHeight: 1.5 }}>
          {roster.talent.length} {only.length === 1 ? `${only[0]} ` : ''}{roster.talent.length === 1 ? 'face' : 'faces'} represented by {/^roster$/i.test(roster.label?.trim() || 'Roster') ? (memberName || 'this agency') : roster.label}.
          {' '}Booking goes through the agency.
        </div>
        <a href={roster.company_url} target="_blank" rel="noopener noreferrer"
          onClick={() => { if (!preview) trackNow('contact_click', { target_id: memberId, meta: { what: 'roster_site' } }) }}
          style={{ fontFamily: 'Inter', fontSize: 11.5, fontWeight: 700, letterSpacing: '0.1em', color: 'var(--t-fg)', textDecoration: 'none', borderBottom: `1px solid ${faint}` }}>
          {hostOf(roster.company_url).toUpperCase()} ↗
        </a>
      </div>

      {/* Filters — only the ones the roster actually has */}
      {(divisions.length > 1 || cities.length > 1) && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
          {divisions.length > 1 && ['All', ...divisions].map(d => (
            <Chip key={d} on={division === d} onClick={() => setDivision(d)}>{d === 'All' ? 'EVERYONE' : d.toUpperCase()}</Chip>
          ))}
          {divisions.length > 1 && cities.length > 1 && <span style={{ width: 1, background: faint, margin: '2px 4px' }} />}
          {cities.length > 1 && ['All', ...cities].map(c => (
            <Chip key={c} on={city === c} onClick={() => setCity(c)}>{c === 'All' ? 'ALL CITIES' : c.toUpperCase()}</Chip>
          ))}
        </div>
      )}

      {shown.length === 0 ? (
        <div style={{ fontFamily: 'Inter', fontSize: 14, color: muted, textAlign: 'center', padding: '48px 0' }}>Nobody matches those filters.</div>
      ) : (
        <div className="roster-grid">
          {shown.map(t => (
            <button key={t.id} type="button" className="roster-card" onClick={() => openCard(t)} aria-label={`${t.name}, view details`}>
              <div className="ph">
                <img src={sizedImage(t.photos[0], 600)} alt={t.name} loading="lazy" draggable={false} />
                {t.photos[1] && <img className="alt" src={sizedImage(t.photos[1], 600)} alt="" loading="lazy" draggable={false} />}
              </div>
              <div style={{ fontFamily: 'Inter', fontSize: 13.5, fontWeight: 700, color: 'var(--t-fg)', marginTop: 9, letterSpacing: '0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {t.name}
              </div>
              <div style={{ fontFamily: 'Inter', fontSize: 11.5, color: muted, marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {[t.division, t.cities.join(' · ')].filter(Boolean).join('  ·  ') || ' '}
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Detail */}
      {open && (
        <div role="dialog" aria-modal="true" aria-label={open.name} onClick={() => setOpen(null)}
          style={{ position: 'fixed', inset: 0, zIndex: 300, background: 'rgba(0,0,0,0.78)', display: 'grid', placeItems: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ width: 'min(920px, 100%)', maxHeight: 'calc(92 * var(--svh, 1vh))', overflow: 'auto', background: 'var(--t-bg)', color: 'var(--t-fg)', borderRadius: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            <div style={{ position: 'relative', background: '#0b0b0b', aspectRatio: '4 / 5' }}
              onTouchStart={e => setX0(e.touches[0].clientX)}
              onTouchEnd={e => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; setX0(null); if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1) }}>
              <img src={sizedImage(open.photos[idx] ?? open.photos[0], 1100)} alt={open.name} draggable={false}
                style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
              {open.photos.length > 1 && (<>
                {([['prev', -1], ['next', 1]] as const).map(([k, dir]) => (
                  <button key={k} type="button" aria-label={k === 'prev' ? 'Previous photo' : 'Next photo'} onClick={() => go(dir)}
                    style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', ...(k === 'prev' ? { left: 10 } : { right: 10 }), width: 38, height: 38, borderRadius: 19, border: 'none', background: 'rgba(0,0,0,0.55)', color: '#fff', cursor: 'pointer', display: 'grid', placeItems: 'center', padding: 0 }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d={k === 'prev' ? 'M15 18l-6-6 6-6' : 'M9 18l6-6-6-6'} /></svg>
                  </button>
                ))}
                <div style={{ position: 'absolute', bottom: 10, left: 0, right: 0, display: 'flex', justifyContent: 'center', gap: 6 }}>
                  {open.photos.map((_, k) => (
                    <button key={k} type="button" aria-label={`Photo ${k + 1}`} onClick={() => setIdx(k)}
                      style={{ width: 8, height: 8, borderRadius: 4, border: 'none', padding: 0, cursor: 'pointer', background: k === idx ? '#fff' : 'rgba(255,255,255,0.45)' }} />
                  ))}
                </div>
              </>)}
            </div>

            <div style={{ padding: '26px 24px 24px', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, lineHeight: 1.05, letterSpacing: '0.01em', textTransform: 'uppercase' }}>{open.name}</div>
                  <div style={{ fontFamily: 'Inter', fontSize: 12.5, color: muted, marginTop: 6 }}>
                    {[open.division, open.cities.join(' · ')].filter(Boolean).join('  ·  ')}
                  </div>
                </div>
                <button type="button" aria-label="Close" onClick={() => setOpen(null)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--t-fg)', fontSize: 24, lineHeight: 1, cursor: 'pointer', padding: 4 }}>×</button>
              </div>

              <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: muted, marginTop: 18 }}>
                REPRESENTED BY {(memberName || 'THE AGENCY').toUpperCase()}
              </div>

              {(() => {
                const { stats, notes } = talentStats(open.bio)
                return (<>
                  {stats.length > 0 && (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(92px, 1fr))', gap: '12px 14px', marginTop: 16, paddingTop: 14, borderTop: `1px solid ${faint}` }}>
                      {stats.map(s => (
                        <div key={s.label} style={{ minWidth: 0 }}>
                          <div style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: muted, textTransform: 'uppercase' }}>{s.label}</div>
                          <div style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 600, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.value}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  {notes.map((n, k) => (
                    <div key={k} style={{ marginTop: 14 }}>
                      {n.label && <div style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: muted, textTransform: 'uppercase' }}>{n.label}</div>}
                      <div style={{ fontFamily: 'Inter', fontSize: 13.5, lineHeight: 1.6, marginTop: 3, color: 'rgba(var(--t-fg-rgb), calc(0.85 * var(--t-a)))' }}>{n.value}</div>
                    </div>
                  ))}
                </>)
              })()}

              <div style={{ marginTop: 'auto', paddingTop: 22, display: 'grid', gap: 8 }}>
                <a href={open.profile_url} target="_blank" rel="noopener noreferrer" onClick={() => viewBook(open)}
                  style={{ display: 'block', textAlign: 'center', padding: '13px 0', borderRadius: 4, background: 'var(--t-fg)', color: 'var(--t-on-fg)', fontFamily: 'Inter', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', textDecoration: 'none' }}>
                  VIEW FULL BOOK ON {hostOf(roster.company_url).toUpperCase()} ↗
                </a>
                {!isSelf && (
                  <button type="button" onClick={askAgency} disabled={preview || asking}
                    title={preview ? 'Preview only: members can message the agency from here' : undefined}
                    style={{ padding: '12px 0', borderRadius: 4, border: `1px solid ${faint}`, background: 'transparent', color: 'var(--t-fg)', fontFamily: 'Inter', fontSize: 12, fontWeight: 700, letterSpacing: '0.1em', cursor: preview ? 'default' : 'pointer', opacity: preview ? 0.6 : 1 }}>
                    {asking ? 'OPENING…' : 'MESSAGE THE AGENCY'}
                  </button>
                )}
                {err && <div style={{ fontFamily: 'Inter', fontSize: 12.5, color: 'var(--t-err)' }}>{err}</div>}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
