'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

type WClass = 'attendant' | 'sanitation' | 'intern' | 'freelancer'
type WStatus = 'applicant' | 'active' | 'inactive'
type ModuleStatus = 'not_started' | 'passed' | 'needs_recert'

interface Cell { slug: string; title: string; version: number; status: ModuleStatus }
interface Worker {
  id: string
  account_id: string | null
  email: string | null
  full_name: string | null
  worker_class: WClass
  status: WStatus
  learning_only: boolean
  created_at: string
  label: string
  requiredCount: number
  passedCount: number
  certified: boolean
  cells: Cell[]
}

const C = { bg: '#0b0b0d', card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#c9b27e' }
const GREEN = '#6ee7a8', AMBER = '#ffb066', RED = '#ff6b6b'

const CLASS_FILTERS: { key: WClass | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'attendant', label: 'Attendant' },
  { key: 'sanitation', label: 'Sanitation' },
  { key: 'intern', label: 'Intern' },
  { key: 'freelancer', label: 'Freelancer' },
]
const STATUS_FILTERS: { key: WStatus | 'all'; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'applicant', label: 'Applicants' },
  { key: 'active', label: 'Active' },
  { key: 'inactive', label: 'Inactive' },
]
const STATUS_OPTS: WStatus[] = ['applicant', 'active', 'inactive']

function statusPill(s: WStatus) {
  const map: Record<WStatus, { bg: string; fg: string; txt: string }> = {
    applicant: { bg: 'rgba(255,176,102,0.14)', fg: AMBER, txt: 'APPLICANT' },
    active: { bg: 'rgba(110,231,168,0.14)', fg: GREEN, txt: 'ACTIVE' },
    inactive: { bg: 'rgba(255,255,255,0.06)', fg: C.dim, txt: 'INACTIVE' },
  }
  const m = map[s]
  return <span style={{ background: m.bg, color: m.fg, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>{m.txt}</span>
}

function cellColor(s: ModuleStatus) {
  if (s === 'passed') return { bg: 'rgba(110,231,168,0.16)', bd: GREEN }
  if (s === 'needs_recert') return { bg: 'rgba(255,176,102,0.16)', bd: AMBER }
  return { bg: 'rgba(255,255,255,0.04)', bd: 'rgba(255,255,255,0.14)' }
}

function when(iso: string): string {
  const d = new Date(iso), mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 60) return `${Math.max(1, mins)}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export default function WorkersRosterPage() {
  const [workers, setWorkers] = useState<Worker[]>([])
  const [loading, setLoading] = useState(true)
  const [unauth, setUnauth] = useState(false)
  const [err, setErr] = useState('')
  const [savingId, setSavingId] = useState<string | null>(null)
  const [fClass, setFClass] = useState<WClass | 'all'>('all')
  const [fStatus, setFStatus] = useState<WStatus | 'all'>('all')

  const load = async () => {
    const r = await fetch('/api/admin/workers')
    if (r.status === 401) { setUnauth(true); setLoading(false); return }
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(d.error || 'Could not load roster.'); setLoading(false); return }
    setWorkers(d.workers ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const setStatus = async (w: Worker, status: WStatus) => {
    if (status === w.status) return
    setSavingId(w.id); setErr('')
    setWorkers(prev => prev.map(x => x.id === w.id ? { ...x, status } : x)) // optimistic
    const r = await fetch(`/api/admin/workers/${w.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    })
    setSavingId(null)
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Could not update.'); load() }
  }

  const counts = useMemo(() => ({
    total: workers.length,
    applicant: workers.filter(w => w.status === 'applicant').length,
    active: workers.filter(w => w.status === 'active').length,
    certified: workers.filter(w => w.certified).length,
  }), [workers])

  const shown = useMemo(() => workers.filter(w =>
    (fClass === 'all' || w.worker_class === fClass) &&
    (fStatus === 'all' || w.status === fStatus)
  ), [workers, fClass, fStatus])

  const tile = (label: string, val: number, color: string) => (
    <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '14px 18px', minWidth: 96 }}>
      <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 30, lineHeight: 1, color }}>{val}</div>
      <div style={{ fontSize: 11, color: C.dim, marginTop: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }}>{label}</div>
    </div>
  )

  const filterPill = (active: boolean, label: string, onClick: () => void) => (
    <button key={label} onClick={onClick} style={{
      border: `1px solid ${active ? C.accent : C.line}`,
      background: active ? 'rgba(201,178,126,0.14)' : 'transparent',
      color: active ? C.accent : C.dim,
      borderRadius: 20, padding: '5px 13px', fontSize: 12, cursor: 'pointer',
    }}>{label}</button>
  )

  return (
    <main style={{ background: C.bg, minHeight: '100vh', color: C.text, padding: '40px 24px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8, gap: 12 }}>
          <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: 0 }}>WORKERS</h1>
          <Link href="/admin/onboarding" style={{ color: C.dim, fontSize: 13, textDecoration: 'none' }}>Onboarding modules →</Link>
        </div>
        <p style={{ color: C.dim, fontSize: 13, marginTop: 0, marginBottom: 22 }}>
          Everyone who applied to work, and how far they are through the orientation modules required for their class.
          Flip <b>Applicant → Active</b> once you&apos;ve screened someone; <b>Inactive</b> takes them out of the pool.
        </p>

        {unauth ? (
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 24 }}>
            Not signed in. <Link href="/admin" style={{ color: C.accent }}>Go to admin login →</Link>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 22 }}>
              {tile('Applicants', counts.applicant, AMBER)}
              {tile('Active', counts.active, GREEN)}
              {tile('Certified', counts.certified, C.accent)}
              {tile('Total', counts.total, C.text)}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              {CLASS_FILTERS.map(c => filterPill(fClass === c.key, c.label, () => setFClass(c.key)))}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
              {STATUS_FILTERS.map(s => filterPill(fStatus === s.key, s.label, () => setFStatus(s.key)))}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, margin: '14px 0 18px', fontSize: 11, color: C.dim, flexWrap: 'wrap' }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: 'rgba(110,231,168,0.16)', border: `1px solid ${GREEN}` }} /> passed</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: 'rgba(255,176,102,0.16)', border: `1px solid ${AMBER}` }} /> needs re-cert</span>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><span style={{ width: 12, height: 12, borderRadius: 3, background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.14)' }} /> not started</span>
            </div>

            {err && <div style={{ color: RED, fontSize: 13, marginBottom: 12 }}>{err}</div>}

            {loading ? <div style={{ color: C.dim }}>Loading…</div> : shown.length === 0 ? (
              <div style={{ color: C.dim }}>{workers.length === 0 ? 'No one has applied to work yet. Members apply from the /work onboarding page.' : 'No workers match these filters.'}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {shown.map(w => (
                  <div key={w.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '16px 18px', opacity: w.status === 'inactive' ? 0.6 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 15, fontWeight: 600 }}>{w.full_name || w.email || '(no name)'}</span>
                          {statusPill(w.status)}
                          {w.certified && <span style={{ background: 'rgba(201,178,126,0.16)', color: C.accent, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '2px 8px', borderRadius: 4 }}>✓ CERTIFIED</span>}
                        </div>
                        <div style={{ fontSize: 12, color: C.dim, marginTop: 3 }}>
                          {w.email || 'no email'} · {w.label}{w.learning_only ? ' · learning-only' : ''} · applied {when(w.created_at)}
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                        <span style={{ fontSize: 12, color: w.certified ? C.accent : C.dim, whiteSpace: 'nowrap' }}>{w.passedCount}/{w.requiredCount} modules</span>
                        <select value={w.status} disabled={savingId === w.id} onChange={e => setStatus(w, e.target.value as WStatus)} style={{
                          background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.line}`, color: C.text,
                          fontFamily: 'Inter, sans-serif', fontSize: 12, padding: '7px 10px', borderRadius: 6, cursor: 'pointer',
                        }}>
                          {STATUS_OPTS.map(s => <option key={s} value={s} style={{ background: C.card }}>{s[0].toUpperCase() + s.slice(1)}</option>)}
                        </select>
                      </div>
                    </div>

                    {w.cells.length > 0 && (
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12 }}>
                        {w.cells.map(cell => {
                          const col = cellColor(cell.status)
                          return (
                            <span key={cell.slug} title={`${cell.title} — ${cell.status.replace('_', ' ')}`} style={{
                              display: 'inline-flex', alignItems: 'center', gap: 6,
                              background: col.bg, border: `1px solid ${col.bd}`, borderRadius: 6,
                              padding: '4px 9px', fontSize: 11, color: cell.status === 'not_started' ? C.dim : C.text, whiteSpace: 'nowrap',
                            }}>
                              {cell.title}
                            </span>
                          )
                        })}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
