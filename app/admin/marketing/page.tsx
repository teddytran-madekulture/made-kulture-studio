'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'

const C = { bg: '#0b0b0d', card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#c9b27e' }

interface Campaign {
  id: string; name: string; segment_key: string; subject: string; status: string
  recipient_count: number; sent_at: string | null; code: string | null; redemptions: number
}
interface Promo { id: string; code: string; active: boolean }

const SEGMENTS: { key: string; label: string }[] = [
  { key: 'all', label: 'All customers' },
  { key: 'members', label: 'Members (have an account)' },
  { key: 'guests', label: 'Guests (no account)' },
  { key: 'recent', label: 'Recent (booked ≤30 days)' },
  { key: 'lapsed', label: 'Lapsed (no booking 90+ days)' },
]

export default function MarketingPage() {
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [promos, setPromos] = useState<Promo[]>([])
  const [unauth, setUnauth] = useState(false)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [f, setF] = useState({ name: '', segment_key: 'all', subject: '', body_html: '', promo_id: '' })

  const load = async () => {
    const r = await fetch('/api/admin/marketing')
    if (r.status === 401) { setUnauth(true); setLoading(false); return }
    const d = await r.json()
    setCampaigns(d.campaigns ?? [])
    fetch('/api/admin/marketing?segments=1').then(x => x.json()).then(x => setCounts(x.counts ?? {})).catch(() => {})
    fetch('/api/admin/promos').then(x => x.json()).then(x => setPromos((x.promos ?? []).filter((p: Promo) => p.active))).catch(() => {})
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const create = async () => {
    setErr(''); setBusy(true)
    const r = await fetch('/api/admin/marketing', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(f) })
    const d = await r.json(); setBusy(false)
    if (!r.ok) { setErr(d.error || 'Could not create.'); return }
    setF({ name: '', segment_key: 'all', subject: '', body_html: '', promo_id: '' })
    load()
  }

  const sendTest = async (id: string) => {
    const to = prompt('Send a test email to which address?')
    if (!to) return
    const r = await fetch(`/api/admin/marketing/${id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ test: true, testEmail: to }) })
    const d = await r.json()
    alert(r.ok ? `Test sent to ${to}. Check it before sending for real.` : `Test failed: ${d.error}`)
  }
  const sendReal = async (c: Campaign) => {
    const n = counts[c.segment_key] ?? 0
    if (!confirm(`Send "${c.name}" to ${n} recipient(s) in "${c.segment_key}"?\n\nThis emails real customers. Make sure you sent yourself a test first.`)) return
    const r = await fetch(`/api/admin/marketing/${c.id}/send`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
    const d = await r.json()
    alert(r.ok ? `Sent to ${d.sent} recipient(s).${d.partialError ? ' (some failed: ' + d.partialError + ')' : ''}` : `Send failed: ${d.error}`)
    load()
  }

  const inp: React.CSSProperties = { background: 'rgba(255,255,255,0.04)', border: `1px solid ${C.line}`, color: C.text, fontFamily: 'Inter, sans-serif', fontSize: 14, padding: '10px 12px', outline: 'none', borderRadius: 6, width: '100%', boxSizing: 'border-box' }
  const lbl: React.CSSProperties = { display: 'block', fontFamily: 'Inter, sans-serif', fontSize: 11, color: C.dim, marginBottom: 4, letterSpacing: '0.06em', textTransform: 'uppercase' }

  return (
    <main style={{ background: C.bg, minHeight: '100vh', color: C.text, padding: '40px 24px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
          <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: 0 }}>MARKETING</h1>
          <Link href="/admin/dashboard" style={{ color: C.dim, fontSize: 13, textDecoration: 'none' }}>← Admin</Link>
        </div>
        <p style={{ color: C.dim, fontSize: 13, marginTop: 0, marginBottom: 28 }}>Email campaigns to your customers. Every email includes an unsubscribe link + studio address. Always send yourself a test first.</p>

        {unauth ? (
          <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 24 }}>
            Not signed in. <Link href="/admin" style={{ color: C.accent }}>Go to admin login →</Link>
          </div>
        ) : (
          <>
            {/* Compose */}
            <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: 20, marginBottom: 28 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                <div><span style={lbl}>Campaign name (internal)</span><input style={inp} value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="Holiday sale 2026" /></div>
                <div><span style={lbl}>Audience</span>
                  <select style={inp} value={f.segment_key} onChange={e => setF({ ...f, segment_key: e.target.value })}>
                    {SEGMENTS.map(s => <option key={s.key} value={s.key}>{s.label}{counts[s.key] != null ? ` (${counts[s.key]})` : ''}</option>)}
                  </select>
                </div>
              </div>
              <div style={{ marginBottom: 14 }}><span style={lbl}>Subject</span><input style={inp} value={f.subject} onChange={e => setF({ ...f, subject: e.target.value })} placeholder="20% off your next shoot 🎬" /></div>
              <div style={{ marginBottom: 14 }}><span style={lbl}>Body (HTML ok — links, bold, etc.)</span><textarea style={{ ...inp, minHeight: 140, resize: 'vertical' }} value={f.body_html} onChange={e => setF({ ...f, body_html: e.target.value })} placeholder="Hey! We just dropped a new set..." /></div>
              <div style={{ marginBottom: 14, maxWidth: 300 }}><span style={lbl}>Attach promo code (optional)</span>
                <select style={inp} value={f.promo_id} onChange={e => setF({ ...f, promo_id: e.target.value })}>
                  <option value="">None</option>
                  {promos.map(p => <option key={p.id} value={p.id}>{p.code}</option>)}
                </select>
              </div>
              {err && <div style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 12 }}>{err}</div>}
              <button onClick={create} disabled={busy} style={{ background: C.accent, color: '#0b0b0d', border: 'none', borderRadius: 6, padding: '11px 22px', fontWeight: 700, fontSize: 12, letterSpacing: '0.1em', cursor: 'pointer' }}>
                {busy ? 'SAVING…' : '+ SAVE DRAFT'}
              </button>
            </div>

            {/* List */}
            {loading ? <div style={{ color: C.dim }}>Loading…</div> : campaigns.length === 0 ? (
              <div style={{ color: C.dim }}>No campaigns yet.</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {campaigns.map(c => (
                  <div key={c.id} style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 10, padding: '14px 18px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, alignItems: 'flex-start' }}>
                      <div>
                        <div style={{ fontSize: 15, fontWeight: 600 }}>{c.name}</div>
                        <div style={{ fontSize: 12, color: C.dim, marginTop: 3 }}>
                          {c.subject} · {c.segment_key}{c.code ? ` · code ${c.code}` : ''}
                          {c.status === 'sent'
                            ? ` · sent to ${c.recipient_count}${c.code ? ` · ${c.redemptions} redeemed` : ''}`
                            : ` · draft`}
                        </div>
                      </div>
                      {c.status === 'sent'
                        ? <span style={{ fontSize: 11, color: '#6bffaa', letterSpacing: '0.08em', whiteSpace: 'nowrap' }}>SENT</span>
                        : (
                          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                            <button onClick={() => sendTest(c.id)} style={{ background: 'none', border: `1px solid ${C.line}`, color: C.dim, borderRadius: 6, padding: '7px 12px', fontSize: 11, cursor: 'pointer' }}>TEST</button>
                            <button onClick={() => sendReal(c)} style={{ background: C.accent, border: 'none', color: '#0b0b0d', borderRadius: 6, padding: '7px 14px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>SEND →</button>
                          </div>
                        )}
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
