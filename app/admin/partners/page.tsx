'use client'
// /admin/partners — partner links (migration 166). Each partner gets
// madekulture.com/p/<code>; a website booking made within 30 days of opening it
// is tagged to them. Tracking only: any perk (studio credit etc.) is your call.
import { useEffect, useState } from 'react'

type Partner = {
  id: string; code: string; name: string; note: string; active: boolean; clicks: number; created_at: string
  owner_email: string | null; bookings: number; cancelled: number; revenue: number
  recent: { id: string; start_time: string; status: string; total: number; set: string; customer: string }[]
}

const card: React.CSSProperties = { background: '#141416', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: 16 }
const input: React.CSSProperties = { width: '100%', boxSizing: 'border-box', background: '#0d0d0f', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 6, padding: '10px 12px', color: '#eee', fontFamily: 'Inter, sans-serif', fontSize: 13, outline: 'none' }
const label: React.CSSProperties = { fontSize: 10.5, fontWeight: 700, letterSpacing: '0.12em', color: '#888', marginBottom: 6, display: 'block' }
const btn = (tone: 'light' | 'ghost' | 'danger'): React.CSSProperties => ({
  fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', padding: '8px 12px', borderRadius: 6, cursor: 'pointer',
  background: tone === 'light' ? '#f2f2f2' : 'transparent', color: tone === 'light' ? '#111' : tone === 'danger' ? '#f0a0a0' : '#bbb',
  border: tone === 'light' ? 'none' : `1px solid ${tone === 'danger' ? 'rgba(240,160,160,0.4)' : 'rgba(255,255,255,0.18)'}`,
})
const money = (n: number) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const when = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))

export default function AdminPartnersPage() {
  const [rows, setRows] = useState<Partner[] | null>(null)
  const [err, setErr] = useState('')
  const [form, setForm] = useState({ name: '', code: '', email: '', note: '' })
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [origin, setOrigin] = useState('https://madekulture.com')
  useEffect(() => { setOrigin(window.location.origin) }, [])

  const load = () => fetch('/api/admin/partners', { cache: 'no-store' }).then(async r => {
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(d.error || 'Could not load partners.'); return }   // never render a failed read as "none"
    setErr(''); setRows(d.partners ?? [])
  }).catch(() => setErr('Could not load partners.'))
  useEffect(() => { load() }, [])

  const add = async (e: React.FormEvent) => {
    e.preventDefault(); setMsg('')
    const r = await fetch('/api/admin/partners', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setMsg(d.error || 'Could not add the partner.'); return }
    setMsg(`Added. Their link: ${origin}/p/${d.code}`)
    setForm({ name: '', code: '', email: '', note: '' }); load()
  }
  const patch = async (id: string, body: Record<string, unknown>) => {
    setBusy(id)
    const r = await fetch('/api/admin/partners', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...body }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) alert(d.error || 'That did not work.')
    setBusy(null); load()
  }
  const remove = async (p: Partner) => {
    if (!confirm(`Delete ${p.name}? Their link stops tagging bookings. Bookings already tagged keep the tag.`)) return
    setBusy(p.id)
    const r = await fetch('/api/admin/partners', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: p.id }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) alert(d.error || 'That did not work.')
    setBusy(null); load()
  }
  const copy = async (p: Partner) => {
    try { await navigator.clipboard.writeText(`${origin}/p/${p.code}`); setCopied(p.id); setTimeout(() => setCopied(null), 1500) } catch {}
  }

  return (
    <div style={{ padding: '24px 20px', maxWidth: 1100, fontFamily: 'Inter, sans-serif', color: '#eee' }}>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 32, margin: '0 0 6px', letterSpacing: '0.02em' }}>PARTNERS</h1>
      <p style={{ color: '#999', fontSize: 13, margin: '0 0 20px', lineHeight: 1.6, maxWidth: 760 }}>
        Give a partner (an agency, a photographer who sends clients) their own link. Anyone who opens it and books on the website within 30 days is tagged to them, so you can see who actually sends you business.
        Tracking only: nothing is paid out automatically.
      </p>

      <form onSubmit={add} style={{ ...card, marginBottom: 22 }}>
        <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', marginBottom: 14 }}>ADD A PARTNER</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div><span style={label}>NAME</span><input style={input} required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Neil Jou Agency" /></div>
          <div>
            <span style={label}>LINK CODE</span>
            <input style={input} required value={form.code} onChange={e => setForm(f => ({ ...f, code: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '') }))} placeholder="neiljou" />
            <div style={{ fontSize: 11.5, color: '#777', marginTop: 5 }}>{origin.replace(/^https?:\/\//, '')}/p/{form.code || 'code'}</div>
          </div>
          <div><span style={label}>THEIR ACCOUNT EMAIL (OPTIONAL)</span><input style={input} type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="info@neiljou.com" /></div>
          <div><span style={label}>NOTE (OPTIONAL)</span><input style={input} value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))} placeholder="Agency, sends shoot clients" /></div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 14, flexWrap: 'wrap' }}>
          <button type="submit" style={btn('light')}>ADD PARTNER</button>
          {msg && <span style={{ fontSize: 12.5, color: msg.startsWith('Added') ? '#6bffaa' : '#f0a0a0' }}>{msg}</span>}
        </div>
      </form>

      {err && <div style={{ ...card, color: '#f0a0a0', marginBottom: 16 }}>{err}</div>}
      {!err && rows === null && <div style={{ color: '#888', fontSize: 13 }}>Loading…</div>}
      {rows?.length === 0 && <div style={{ color: '#888', fontSize: 13 }}>No partners yet.</div>}

      <div style={{ display: 'grid', gap: 14 }}>
        {(rows ?? []).map(p => (
          <div key={p.id} style={{ ...card, opacity: p.active ? 1 : 0.6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 17, fontWeight: 700 }}>{p.name}{!p.active && <span style={{ fontSize: 11, color: '#999', marginLeft: 8 }}>OFF</span>}</div>
                <div style={{ fontSize: 12.5, color: '#999', marginTop: 3 }}>
                  <code style={{ color: '#d4a843' }}>{origin.replace(/^https?:\/\//, '')}/p/{p.code}</code>
                  {p.owner_email ? <> · {p.owner_email}</> : null}{p.note ? <> · {p.note}</> : null}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 22 }}>
                {([['CLICKS', String(p.clicks)], ['BOOKINGS', String(p.bookings)], ['REVENUE', money(p.revenue)]] as const).map(([k, v]) => (
                  <div key={k} style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.12em', color: '#888' }}>{k}</div>
                    <div style={{ fontSize: 20, fontWeight: 700, marginTop: 2 }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>

            {p.recent.length > 0 && (
              <div style={{ marginTop: 14, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 10 }}>
                {p.recent.map(b => (
                  <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 12.5, padding: '5px 0', color: b.status === 'cancelled' ? '#777' : '#ccc' }}>
                    <span>{when(b.start_time)} · {b.set} · {b.customer}</span>
                    <span>{b.status === 'cancelled' ? 'cancelled' : money(b.total)}</span>
                  </div>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              <button type="button" style={btn('light')} onClick={() => copy(p)}>{copied === p.id ? 'COPIED ✓' : 'COPY LINK'}</button>
              <button type="button" style={btn('ghost')} disabled={busy === p.id} onClick={() => patch(p.id, { active: !p.active })}>{p.active ? 'TURN OFF' : 'TURN ON'}</button>
              <button type="button" style={btn('danger')} disabled={busy === p.id} onClick={() => remove(p)}>DELETE</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
