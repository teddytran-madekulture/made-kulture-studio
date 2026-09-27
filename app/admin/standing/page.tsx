'use client'
// Standing & Rewards — settings + the recent incident log (migration 109).
// Linked from BOTH admin sidebars (components/AdminShell.tsx AND the dashboard's
// own nav) — see the two-sidebars gotcha.
import { useEffect, useState } from 'react'
import { SEVERITIES, LEVEL_LABEL, type StandingConfig, type Severity } from '@/lib/standing'

const C = { card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#c9b27e' }
const inp: React.CSSProperties = { background: '#0b0b0d', border: `1px solid ${C.line}`, color: C.text, padding: '8px 10px', fontFamily: 'Inter, sans-serif', fontSize: 13, colorScheme: 'dark' }
const optStyle: React.CSSProperties = { background: '#141416', color: '#fff' }
const h2: React.CSSProperties = { fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 22, letterSpacing: '0.03em', margin: '0 0 12px' }
const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: 20, marginBottom: 24 }
const small: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.dim, lineHeight: 1.6 }

interface Rewards { enabled: boolean; memberRate: number; plusRate: number }

export default function StandingPage() {
  const [cfg, setCfg] = useState<StandingConfig | null>(null)
  const [rw, setRw] = useState<Rewards | null>(null)
  const [owed, setOwed] = useState<{ all: number; rewards: number } | null>(null)
  const [incidents, setIncidents] = useState<any[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [unauth, setUnauth] = useState(false)

  const load = async () => {
    const [a, b] = await Promise.all([fetch('/api/admin/standing-settings', { cache: 'no-store' }), fetch('/api/admin/incidents', { cache: 'no-store' })])
    if (a.status === 401) { setUnauth(true); return }
    const d = await a.json(); const e = await b.json()
    if (!a.ok) { setMsg(`⚠️ ${d.error || 'Could not load settings.'}`); return }
    setCfg(d.config); setRw(d.rewards); setOwed({ all: d.outstandingCents, rewards: d.rewardOutstandingCents })
    setIncidents(e.incidents ?? [])
  }
  useEffect(() => { load() }, [])

  const save = async (body: any, ok: string) => {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/admin/standing-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await r.json()
      if (!r.ok) { setMsg(`⚠️ ${d.error || 'Not saved.'}`); return }
      setCfg(d.config); setRw(d.rewards); setMsg(ok)
    } catch { setMsg('⚠️ Not saved — check your connection.') }
    finally { setBusy(false) }
  }

  if (unauth) return <div style={{ padding: 40, fontFamily: 'Inter' }}>Sign in to the admin first.</div>
  if (!cfg || !rw) return <div style={{ padding: 40, fontFamily: 'Inter', color: C.dim }}>{msg ?? 'Loading…'}</div>

  const catLabel = (k: string) => cfg.categories.find(c => c.key === k)?.label ?? k

  return (
    <div style={{ padding: '32px 24px', maxWidth: 820, color: C.text }}>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: '0 0 6px' }}>STANDING &amp; REWARDS</h1>
      <p style={{ ...small, margin: '0 0 24px' }}>Log incidents from a booking or a customer on the dashboard. This page holds the rules.</p>
      {msg && <div style={{ ...small, color: msg.startsWith('⚠️') ? '#fbbf24' : '#4ade80', marginBottom: 16 }}>{msg}</div>}

      {/* ── Rewards ── */}
      <div style={card}>
        <h2 style={h2}>MADE KULTURE REWARDS</h2>
        <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'Inter', fontSize: 14, marginBottom: 14 }}>
          <input type="checkbox" checked={rw.enabled} disabled={busy}
            onChange={e => {
              const on = e.target.checked
              if (on && !window.confirm('Turn rewards ON? Bookings made from now on will earn credit after their session.')) return
              save({ rewards: { enabled: on } }, on ? 'Rewards are ON. New bookings earn from now.' : 'Rewards are OFF. Nothing new locks a rate.')
            }} />
          <span style={{ fontWeight: 600, color: rw.enabled ? '#4ade80' : C.dim }}>{rw.enabled ? 'ON — new bookings earn' : 'OFF — nothing earns'}</span>
        </label>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <label style={small}>Members %<br /><input type="number" min={0} max={50} step={0.5} value={rw.memberRate} onChange={e => setRw({ ...rw, memberRate: Number(e.target.value) })} style={{ ...inp, width: 90 }} /></label>
          <label style={small}>Plus %<br /><input type="number" min={0} max={50} step={0.5} value={rw.plusRate} onChange={e => setRw({ ...rw, plusRate: Number(e.target.value) })} style={{ ...inp, width: 90 }} /></label>
          <button disabled={busy} onClick={() => save({ rewards: { memberRate: rw.memberRate, plusRate: rw.plusRate } }, 'Rates saved. They apply to new bookings only.')}
            style={{ ...inp, cursor: 'pointer', background: C.accent, color: '#080808', fontWeight: 700, border: 'none', letterSpacing: '0.1em', fontSize: 11 }}>SAVE RATES</button>
        </div>
        <p style={{ ...small, marginTop: 12 }}>
          Paid nightly after each session, only in good standing, on set time + gear paid by card. Reward credit expires after 12 months with no completed booking (30-day warning email first).
        </p>
        {owed && (
          <p style={{ ...small, marginTop: 8 }}>
            Studio credit outstanding (services owed): <strong style={{ color: C.text }}>${(owed.all / 100).toFixed(2)}</strong>
            {' '}· of which rewards: <strong style={{ color: C.text }}>${(owed.rewards / 100).toFixed(2)}</strong>
          </p>
        )}
      </div>

      {/* ── Standing rules ── */}
      <div style={card}>
        <h2 style={h2}>ACCOUNT STANDING RULES</h2>
        <div style={{ ...small, marginBottom: 8 }}>Points per severity</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          {SEVERITIES.map(s => (
            <label key={s} style={small}>{s}<br />
              <input type="number" min={0} value={cfg.points[s]} onChange={e => setCfg({ ...cfg, points: { ...cfg.points, [s]: Number(e.target.value) } })} style={{ ...inp, width: 80 }} />
            </label>
          ))}
        </div>
        <div style={{ ...small, marginBottom: 8 }}>Points needed for each level (good standing below warning)</div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          {(['warning', 'probation', 'suspended'] as const).map(k => (
            <label key={k} style={small}>{LEVEL_LABEL[k]}<br />
              <input type="number" min={1} value={cfg.thresholds[k]} onChange={e => setCfg({ ...cfg, thresholds: { ...cfg.thresholds, [k]: Number(e.target.value) } })} style={{ ...inp, width: 80 }} />
            </label>
          ))}
          <label style={small}>Email customer from<br />
            <select value={cfg.emailFrom} onChange={e => setCfg({ ...cfg, emailFrom: e.target.value as Severity })} style={{ ...inp, width: 130 }}>
              {SEVERITIES.map(s => <option key={s} value={s} style={optStyle}>{s} and up</option>)}
            </select>
          </label>
        </div>
        <div style={{ ...small, marginBottom: 8 }}>Default severity per category</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16 }}>
          {cfg.categories.map((c, i) => (
            <div key={c.key} style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <span style={{ fontFamily: 'Inter', fontSize: 13, flex: 1 }}>{c.label}</span>
              <select value={c.severity} onChange={e => {
                const next = [...cfg.categories]; next[i] = { ...c, severity: e.target.value as Severity }; setCfg({ ...cfg, categories: next })
              }} style={{ ...inp, width: 120 }}>
                {SEVERITIES.map(s => <option key={s} value={s} style={optStyle}>{s}</option>)}
              </select>
            </div>
          ))}
        </div>
        <button disabled={busy} onClick={() => save({ config: cfg }, 'Standing rules saved. Every customer’s standing uses them from now.')}
          style={{ ...inp, cursor: 'pointer', background: C.accent, color: '#080808', fontWeight: 700, border: 'none', letterSpacing: '0.1em', fontSize: 11 }}>SAVE RULES</button>
        <p style={{ ...small, marginTop: 12 }}>Points drop off {cfg.expiryMonths} months after an incident. Critical incidents never drop off.</p>
      </div>

      {/* ── Recent incidents ── */}
      <div style={card}>
        <h2 style={h2}>RECENT INCIDENTS</h2>
        {incidents.length === 0 ? <div style={small}>None logged yet.</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {incidents.map(i => (
              <div key={i.id} style={{ borderBottom: `1px solid ${C.line}`, paddingBottom: 8, opacity: i.voided_at ? 0.45 : 1 }}>
                <div style={{ fontFamily: 'Inter', fontSize: 13 }}>
                  <strong>{i.customers?.name || i.customers?.email || 'Customer'}</strong> · {catLabel(i.category)}
                </div>
                <div style={small}>{i.occurred_on} · {i.severity} · {i.points} pt{i.customer_notified_at ? ' · emailed' : ''}{i.voided_at ? ` · VOIDED: ${i.void_reason ?? ''}` : ''}</div>
                {i.details && <div style={{ ...small, color: 'rgba(255,255,255,0.7)' }}>{i.details}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
