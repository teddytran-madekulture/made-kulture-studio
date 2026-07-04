'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

interface Promo {
  id: string; code: string; kind: 'percent' | 'fixed'; value: number
  min_cents: number | null; max_uses: number | null; uses: number
  per_customer_limit: number | null; starts_at: string | null; expires_at: string | null
  active: boolean; label: string | null; created_at: string
}

const C = { bg: '#0b0b0d', card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#c9b27e' }

function discountLabel(p: Promo) {
  return p.kind === 'percent' ? `${p.value}% off` : `$${(p.value / 100).toFixed(2)} off`
}

export default function PromosPage() {
  const [promos, setPromos] = useState<Promo[]>([])
  const [loading, setLoading] = useState(true)
  const [unauth, setUnauth] = useState(false)
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const [f, setF] = useState({ code: '', kind: 'percent' as 'percent' | 'fixed', amount: '', minDollars: '', maxUses: '', perCustomer: '1', expires: '', label: '' })

  const load = async () => {
    const r = await fetch('/api/admin/promos')
    if (r.status === 401) { setUnauth(true); setLoading(false); return }
    const d = await r.json(); setPromos(d.promos ?? []); setLoading(false)
  }
  useEffect(() => { load() }, [])

  const create = async () => {
    setErr(''); setBusy(true)
    const value = f.kind === 'fixed' ? Math.round(Number(f.amount) * 100) : Math.round(Number(f.amount))
    const body = {
      code: f.code, kind: f.kind, value,
      min_cents: f.minDollars ? Math.round(Number(f.minDollars) * 100) : null,
      max_uses: f.maxUses || null,
      per_customer_limit: f.perCustomer || null,
      expires_at: f.expires ? new Date(f.expires).toISOString() : null,
      label: f.label || null,
    }
    const r = await fetch('/api/admin/promos', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const d = await r.json(); setBusy(false)
    if (!r.ok) { setErr(d.error || 'Could not create code.'); return }
    setF({ code: '', kind: 'percent', amount: '', minDollars: '', maxUses: '', perCustomer: '1', expires: '', label: '' })
    load()
  }

  const toggle = async (p: Promo) => {
    await fetch(`/api/admin/promos/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ active: !p.active }) })
    load()
  }

  const inp: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.line}`, color: C.text, fontFamily: 'Inter, sans-serif', fontSize: 14, padding: '10px 12px', outline: 'none', borderRadius: 6, width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontFamily: 'Inter, sans-serif', fontSize: 11, color: C.dim, marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }

  return (
    <main style={{ background: C.bg, minHeight: '100vh', color: C.text, padding: '40px 24px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 900, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: 0 }}>PROMO CODES</h1>
          <Link href="/admin/dashboard" style={{ color: C.dim, fontSize: 13, textDecoration: 'none' }}>← Admin</Link>
        </div>
        <p style={{ color: C.dim, fontSize: 13, marginTop: 0, marginBottom: 28 }}>Create discount codes for sales and campaigns. Codes apply at checkout.</p>

        {unauth ? (
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 24 }}>
            Not signed in. <Link href="/admin" style={{ color: C.accent }}>Go to admin login →</Link>
          </div>
        ) : (
          <>
            {/* Create */}
            <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 20, marginBottom: 28 }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 14 }}>
                <div><span style={lbl}>Code</span><input style={{ ...inp, textTransform: 'uppercase' }} value={f.code} onChange={e => setF({ ...f, code: e.target.value })} placeholder="HOLIDAY20" /></div>
                <div><span style={lbl}>Type</span>
                  <select style={inp} value={f.kind} onChange={e => setF({ ...f, kind: e.target.value as any })}>
                    <option value="percent">% off</option>
                    <option value="fixed">$ off</option>
                  </select>
                </div>
                <div><span style={lbl}>{f.kind === 'percent' ? 'Percent (e.g. 20)' : 'Dollars off'}</span><input style={inp} value={f.amount} onChange={e => setF({ ...f, amount: e.target.value })} inputMode="decimal" /></div>
                <div><span style={lbl}>Min order $ (opt)</span><input style={inp} value={f.minDollars} onChange={e => setF({ ...f, minDollars: e.target.value })} inputMode="decimal" /></div>
                <div><span style={lbl}>Max total uses (opt)</span><input style={inp} value={f.maxUses} onChange={e => setF({ ...f, maxUses: e.target.value })} inputMode="numeric" placeholder="∞" /></div>
                <div><span style={lbl}>Per customer</span><input style={inp} value={f.perCustomer} onChange={e => setF({ ...f, perCustomer: e.target.value })} inputMode="numeric" /></div>
                <div><span style={lbl}>Expires (opt)</span><input style={inp} type="date" value={f.expires} onChange={e => setF({ ...f, expires: e.target.value })} /></div>
                <div><span style={lbl}>Label (internal)</span><input style={inp} value={f.label} onChange={e => setF({ ...f, label: e.target.value })} placeholder="Holiday 2026" /></div>
              </div>
              {err && <div style={{ color: '#ff6b6b', fontSize: 13, marginTop: 12 }}>{err}</div>}
              <button onClick={create} disabled={busy} style={{ marginTop: 16, background: C.accent, color: '#0b0b0d', border: 'none', borderRadius: 6, padding: '11px 22px', fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', cursor: 'pointer' }}>
                {busy ? 'CREATING…' : '+ CREATE CODE'}
              </button>
            </div>

            {/* List */}
            {loading ? <div style={{ color: C.dim }}>Loading…</div> : promos.length === 0 ? (
              <div style={{ color: C.dim }}>No codes yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {promos.map(p => (
                  <div key={p.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '14px 18px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, opacity: p.active ? 1 : 0.5 }}>
                    <div>
                      <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 16, fontWeight: 700, color: C.accent }}>{p.code}</div>
                      <div style={{ fontSize: 12, color: C.dim, marginTop: 2 }}>
                        {discountLabel(p)}
                        {p.min_cents ? ` · min $${(p.min_cents / 100).toFixed(0)}` : ''}
                        {` · used ${p.uses}${p.max_uses ? `/${p.max_uses}` : ''}`}
                        {p.per_customer_limit ? ` · ${p.per_customer_limit}/customer` : ''}
                        {p.expires_at ? ` · exp ${new Date(p.expires_at).toLocaleDateString()}` : ''}
                        {p.label ? ` · ${p.label}` : ''}
                      </div>
                    </div>
                    <button onClick={() => toggle(p)} style={{ background: 'none', border: `1px solid ${p.active ? 'rgba(255,80,80,0.4)' : C.line}`, color: p.active ? '#ff6b6b' : C.dim, borderRadius: 6, padding: '7px 14px', fontSize: 11, letterSpacing: '0.08em', cursor: 'pointer', whiteSpace: 'nowrap' }}>
                      {p.active ? 'DEACTIVATE' : 'ACTIVATE'}
                    </button>
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
