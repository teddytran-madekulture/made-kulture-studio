'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Opp {
  id: string; name: string; type: string | null; amount: string | null; fit: number
  status: string; deadline: string | null; next_action: string | null
  url: string | null; notes: string | null; sort: number; created_at: string
}

const C = { bg: '#0b0b0d', card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#c9b27e' }

const STATUSES: [string, string][] = [
  ['not_started', 'Not started'],
  ['researching', 'Researching'],
  ['preparing', 'Preparing'],
  ['applied', 'Applied'],
  ['approved', 'Approved'],
  ['declined', 'Declined'],
]
const STATUS_COLOR: Record<string, string> = {
  not_started: C.dim, researching: '#8ab4f8', preparing: '#c9b27e',
  applied: '#6fb8ff', approved: '#6ee7a8', declined: '#ff6b6b',
}
const stars = (n: number) => '★'.repeat(Math.max(0, Math.min(5, n))) + '☆'.repeat(Math.max(0, 5 - n))

export default function FundingPage() {
  const [opps, setOpps] = useState<Opp[]>([])
  const [loading, setLoading] = useState(true)
  const [unauth, setUnauth] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ name: '', type: 'Grant', amount: '', deadline: '', url: '', next_action: '' })

  const load = async () => {
    const r = await fetch('/api/admin/funding')
    if (r.status === 401) { setUnauth(true); setLoading(false); return }
    const d = await r.json(); setOpps(d.funding ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const patch = async (id: string, body: Record<string, any>) => {
    await fetch(`/api/admin/funding/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    load()
  }
  const patchLocal = (id: string, key: keyof Opp, val: any) =>
    setOpps(prev => prev.map(o => o.id === id ? { ...o, [key]: val } : o))

  const create = async () => {
    setErr(''); setBusy(true)
    const r = await fetch('/api/admin/funding', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
    const d = await r.json(); setBusy(false)
    if (!r.ok) { setErr(d.error || 'Could not add.'); return }
    setF({ name: '', type: 'Grant', amount: '', deadline: '', url: '', next_action: '' })
    load()
  }

  const remove = async (id: string) => {
    await fetch(`/api/admin/funding/${id}`, { method: 'DELETE' })
    load()
  }

  const inp: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.line}`, color: C.text, fontFamily: 'Inter, sans-serif', fontSize: 14, padding: '10px 12px', outline: 'none', borderRadius: 6, width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontFamily: 'Inter, sans-serif', fontSize: 11, color: C.dim, marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }
  const editInp: React.CSSProperties = { ...inp, fontSize: 13, padding: '7px 9px' }

  // Pipeline summary
  const active = opps.filter(o => !['approved', 'declined'].includes(o.status)).length
  const applied = opps.filter(o => o.status === 'applied').length
  const won = opps.filter(o => o.status === 'approved').length

  return (
    <main style={{ background: C.bg, minHeight: '100vh', color: C.text, padding: '40px 24px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 980, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: 0 }}>FUNDING</h1>
          <Link href="/admin/dashboard" style={{ color: C.dim, fontSize: 13, textDecoration: 'none' }}>← Admin</Link>
        </div>
        <p style={{ color: C.dim, fontSize: 13, marginTop: 0, marginBottom: 20 }}>
          Grants, loans & rebates to fund the buildout. Update status and next actions as you work each one.
        </p>

        {unauth ? (
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 24 }}>
            Not signed in. <Link href="/admin" style={{ color: C.accent }}>Go to admin login →</Link>
          </div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 22, marginBottom: 24, fontSize: 13, color: C.dim }}>
              <span><b style={{ color: C.text }}>{active}</b> in pipeline</span>
              <span><b style={{ color: '#6fb8ff' }}>{applied}</b> applied</span>
              <span><b style={{ color: '#6ee7a8' }}>{won}</b> approved</span>
            </div>

            {/* List */}
            {loading ? <div style={{ color: C.dim }}>Loading…</div> : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 34 }}>
                {opps.map(o => (
                  <div key={o.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '16px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
                      <div style={{ minWidth: 220, flex: 1 }}>
                        <div style={{ fontSize: 16, fontWeight: 700, color: C.text }}>
                          {o.url ? <a href={o.url} target="_blank" rel="noreferrer" style={{ color: C.text, textDecoration: 'none' }}>{o.name} <span style={{ color: C.accent, fontSize: 12 }}>↗</span></a> : o.name}
                        </div>
                        <div style={{ fontSize: 12, color: C.dim, marginTop: 3 }}>
                          {o.type ? o.type : ''}{o.amount ? ` · ${o.amount}` : ''}{o.deadline ? ` · ${o.deadline}` : ''}
                          <span title="fit" style={{ color: C.accent, marginLeft: 8, letterSpacing: 1 }}>{stars(o.fit)}</span>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <select
                          value={o.status}
                          onChange={e => patch(o.id, { status: e.target.value })}
                          style={{ ...editInp, width: 'auto', color: STATUS_COLOR[o.status] || C.text, fontWeight: 600 }}>
                          {STATUSES.map(([v, l]) => <option key={v} value={v} style={{ color: '#111' }}>{l}</option>)}
                        </select>
                        <button onClick={() => remove(o.id)} title="Remove" style={{ background: 'none', border: `1px solid ${C.line}`, color: C.dim, borderRadius: 6, padding: '7px 10px', fontSize: 12, cursor: 'pointer' }}>✕</button>
                      </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 12 }}>
                      <div>
                        <span style={lbl}>Next action</span>
                        <input
                          style={editInp}
                          value={o.next_action ?? ''}
                          onChange={e => patchLocal(o.id, 'next_action', e.target.value)}
                          onBlur={e => patch(o.id, { next_action: e.target.value })}
                          placeholder="What's the next step…" />
                      </div>
                      <div>
                        <span style={lbl}>Notes</span>
                        <input
                          style={editInp}
                          value={o.notes ?? ''}
                          onChange={e => patchLocal(o.id, 'notes', e.target.value)}
                          onBlur={e => patch(o.id, { notes: e.target.value })}
                          placeholder="Amounts, contacts, deadlines…" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add */}
            <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 20 }}>
              <div style={{ fontSize: 13, color: C.dim, marginBottom: 14, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Add an opportunity</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 14 }}>
                <div><span style={lbl}>Name</span><input style={inp} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Program name" /></div>
                <div><span style={lbl}>Type</span>
                  <select style={inp} value={f.type} onChange={e => setF({ ...f, type: e.target.value })}>
                    {['Grant', 'Loan', 'Rebate', 'Advising', 'Other'].map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                </div>
                <div><span style={lbl}>Amount</span><input style={inp} value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} placeholder="$10K" /></div>
                <div><span style={lbl}>Deadline / timing</span><input style={inp} value={f.deadline} onChange={e => setF({ ...f, deadline: e.target.value })} placeholder="Open now" /></div>
                <div><span style={lbl}>Link</span><input style={inp} value={f.url} onChange={e => setF({ ...f, url: e.target.value })} placeholder="https://…" /></div>
                <div><span style={lbl}>Next action</span><input style={inp} value={f.next_action} onChange={e => setF({ ...f, next_action: e.target.value })} /></div>
              </div>
              {err && <div style={{ color: '#ff6b6b', fontSize: 13, marginTop: 12 }}>{err}</div>}
              <button onClick={create} disabled={busy} style={{ marginTop: 16, background: C.accent, color: '#0b0b0d', border: 'none', borderRadius: 6, padding: '11px 22px', fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', cursor: 'pointer' }}>
                {busy ? 'ADDING…' : '+ ADD'}
              </button>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
