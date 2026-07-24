'use client'
import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'

type WClass = 'attendant' | 'sanitation' | 'intern' | 'freelancer'
type ShiftState = 'open' | 'claimed' | 'cancelled' | 'past'
interface Shift {
  id: string
  starts_at: string
  ends_at: string
  worker_class: WClass
  notes: string
  claimed_by: string | null
  claimed_at: string | null
  cancelled_at: string | null
  label: string
  state: ShiftState
  claimer: { name: string | null; email: string | null } | null
}

const C = { bg: '#0b0b0d', card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#c9b27e' }
const GREEN = '#6ee7a8', AMBER = '#ffb066', RED = '#ff6b6b'
const CLASSES: { key: WClass; label: string }[] = [
  { key: 'attendant', label: 'Attendant' },
  { key: 'sanitation', label: 'Sanitation' },
  { key: 'intern', label: 'Intern' },
  { key: 'freelancer', label: 'Freelancer' },
]

function fmtRange(startIso: string, endIso: string): string {
  const s = new Date(startIso), e = new Date(endIso)
  const day = s.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
  const t = (d: Date) => d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const sameDay = s.toDateString() === e.toDateString()
  return sameDay ? `${day} · ${t(s)} – ${t(e)}` : `${day} ${t(s)} → ${e.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })} ${t(e)}`
}

function statePill(st: ShiftState) {
  const m = ({
    open: { bg: 'rgba(110,231,168,0.14)', fg: GREEN, txt: 'OPEN' },
    claimed: { bg: 'rgba(201,178,126,0.16)', fg: C.accent, txt: 'CLAIMED' },
    cancelled: { bg: 'rgba(255,107,107,0.14)', fg: RED, txt: 'CANCELLED' },
    past: { bg: 'rgba(255,255,255,0.06)', fg: C.dim, txt: 'PAST' },
  } as Record<ShiftState, { bg: string; fg: string; txt: string }>)[st]
  return <span style={{ background: m.bg, color: m.fg, fontSize: 10, fontWeight: 700, letterSpacing: '0.06em', padding: '2px 8px', borderRadius: 4, whiteSpace: 'nowrap' }}>{m.txt}</span>
}

export default function AdminShiftsPage() {
  const [shifts, setShifts] = useState<Shift[]>([])
  const [loading, setLoading] = useState(true)
  const [unauth, setUnauth] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [confirmDel, setConfirmDel] = useState<string | null>(null)
  const [f, setF] = useState({ starts_at: '', ends_at: '', worker_class: 'attendant' as WClass, notes: '' })

  const load = async () => {
    const r = await fetch('/api/admin/shifts')
    if (r.status === 401) { setUnauth(true); setLoading(false); return }
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(d.error || 'Could not load shifts.'); setLoading(false); return }
    setShifts(d.shifts ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const post = async () => {
    setErr('')
    if (!f.starts_at || !f.ends_at) { setErr('Enter a start and end time.'); return }
    // datetime-local gives a tz-less local string; convert to a real UTC instant
    // here (in the browser's timezone) so the server stores the intended time.
    const sd = new Date(f.starts_at), ed = new Date(f.ends_at)
    if (isNaN(sd.getTime()) || isNaN(ed.getTime())) { setErr('Enter a valid start and end time.'); return }
    setBusy(true)
    const r = await fetch('/api/admin/shifts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starts_at: sd.toISOString(), ends_at: ed.toISOString(), worker_class: f.worker_class, notes: f.notes }),
    })
    const d = await r.json().catch(() => ({})); setBusy(false)
    if (!r.ok) { setErr(d.error || 'Could not post shift.'); return }
    setF({ starts_at: '', ends_at: '', worker_class: f.worker_class, notes: '' }); load()
  }

  const act = async (id: string, action: string) => {
    setErr('')
    const r = await fetch(`/api/admin/shifts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }) })
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Could not update.'); return }
    load()
  }
  const del = async (id: string) => {
    setErr(''); setConfirmDel(null)
    const r = await fetch(`/api/admin/shifts/${id}`, { method: 'DELETE' })
    if (!r.ok) { const d = await r.json().catch(() => ({})); setErr(d.error || 'Could not delete.'); return }
    load()
  }

  const counts = useMemo(() => ({
    open: shifts.filter(s => s.state === 'open').length,
    claimed: shifts.filter(s => s.state === 'claimed').length,
  }), [shifts])

  const inp: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.line}`, color: C.text, fontFamily: 'Inter, sans-serif', fontSize: 14, padding: '10px 12px', outline: 'none', borderRadius: 6, width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontFamily: 'Inter, sans-serif', fontSize: 11, color: C.dim, marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }
  const smallBtn = (color: string): React.CSSProperties => ({ background: 'none', border: `1px solid ${C.line}`, color, borderRadius: 6, padding: '6px 12px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' })

  return (
    <main style={{ background: C.bg, minHeight: '100vh', color: C.text, padding: '40px 24px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 920, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8, gap: 12 }}>
          <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: 0 }}>SHIFTS</h1>
          <Link href="/admin/workers" style={{ color: C.dim, fontSize: 13, textDecoration: 'none' }}>Worker roster →</Link>
        </div>
        <p style={{ color: C.dim, fontSize: 13, marginTop: 0, marginBottom: 22 }}>
          Post a shift for a role and an <b>active, certified</b> worker of that class can claim it. {counts.open} open · {counts.claimed} claimed.
        </p>

        {unauth ? (
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 24 }}>
            Not signed in. <Link href="/admin" style={{ color: C.accent }}>Go to admin login →</Link>
          </div>
        ) : (
          <>
            {/* Post a shift */}
            <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 20, marginBottom: 28 }}>
              <div style={{ fontSize: 13, fontWeight: 600, letterSpacing: '0.04em', marginBottom: 14 }}>Post a shift</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14 }}>
                <div><span style={lbl}>Starts</span><input type="datetime-local" style={inp} value={f.starts_at} onChange={e => setF({ ...f, starts_at: e.target.value })} /></div>
                <div><span style={lbl}>Ends</span><input type="datetime-local" style={inp} value={f.ends_at} onChange={e => setF({ ...f, ends_at: e.target.value })} /></div>
                <div>
                  <span style={lbl}>Role needed</span>
                  <select style={inp} value={f.worker_class} onChange={e => setF({ ...f, worker_class: e.target.value as WClass })}>
                    {CLASSES.map(c => <option key={c.key} value={c.key} style={{ background: C.card }}>{c.label}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <span style={lbl}>Notes (optional)</span>
                <input style={inp} value={f.notes} onChange={e => setF({ ...f, notes: e.target.value })} placeholder="e.g. buyout — expect a big crew, keep Commons tidy" />
              </div>
              {err && <div style={{ color: RED, fontSize: 13, marginTop: 12 }}>{err}</div>}
              <button onClick={post} disabled={busy} style={{ marginTop: 16, background: C.accent, color: '#0b0b0d', border: 'none', borderRadius: 6, padding: '11px 22px', fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', cursor: 'pointer' }}>
                {busy ? 'POSTING…' : '+ POST SHIFT'}
              </button>
            </div>

            {/* Board */}
            {loading ? <div style={{ color: C.dim }}>Loading…</div> : shifts.length === 0 ? (
              <div style={{ color: C.dim }}>No shifts yet. Post one above.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {shifts.map(s => (
                  <div key={s.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '14px 18px', opacity: s.state === 'cancelled' || s.state === 'past' ? 0.6 : 1 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 15, fontWeight: 600 }}>{fmtRange(s.starts_at, s.ends_at)}</span>
                          {statePill(s.state)}
                          <span style={{ fontSize: 11, color: C.dim, border: `1px solid ${C.line}`, borderRadius: 20, padding: '2px 10px' }}>{s.label}</span>
                        </div>
                        <div style={{ fontSize: 12, color: C.dim, marginTop: 4 }}>
                          {s.claimer ? `Claimed by ${s.claimer.name || s.claimer.email || 'a worker'}` : s.state === 'open' ? 'Unclaimed' : ''}
                          {s.notes ? `${s.claimer || s.state === 'open' ? ' · ' : ''}${s.notes}` : ''}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8, flexShrink: 0, flexWrap: 'wrap' }}>
                        {s.state === 'claimed' && <button onClick={() => act(s.id, 'release')} style={smallBtn(C.text)}>RELEASE</button>}
                        {s.state === 'cancelled'
                          ? <button onClick={() => act(s.id, 'uncancel')} style={smallBtn(C.text)}>RESTORE</button>
                          : s.state !== 'past' && <button onClick={() => act(s.id, 'cancel')} style={smallBtn(AMBER)}>CANCEL</button>}
                        {confirmDel === s.id
                          ? <button onClick={() => del(s.id)} style={smallBtn(RED)}>CONFIRM DELETE</button>
                          : <button onClick={() => setConfirmDel(s.id)} style={smallBtn(C.dim)}>DELETE</button>}
                      </div>
                    </div>
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
