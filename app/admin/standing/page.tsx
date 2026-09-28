'use client'
// Account Standing — rules + the recent incident log (migration 109).
// Rewards settings moved to /admin/credit (components/admin/RewardsSettings) 2026-09-27.
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
  const [matches, setMatches] = useState<any[]>([])
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
    setMatches(d.matches ?? [])
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
  if (!cfg) return <div style={{ padding: 40, fontFamily: 'Inter', color: C.dim }}>{msg ?? 'Loading…'}</div>

  const catLabel = (k: string) => cfg.categories.find(c => c.key === k)?.label ?? k

  return (
    <div style={{ padding: '32px 24px', maxWidth: 820, color: C.text }}>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: '0 0 6px' }}>ACCOUNT STANDING</h1>
      <p style={{ ...small, margin: '0 0 24px' }}>Log incidents from a booking or a customer on the dashboard. This page holds the rules. Rewards settings are on <a href="/admin/credit" style={{ color: C.accent }}>Credit &amp; Rewards</a>.</p>
      {msg && <div style={{ ...small, color: msg.startsWith('⚠️') ? '#fbbf24' : '#4ade80', marginBottom: 16 }}>{msg}</div>}

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
            <select value={cfg.emailFrom} onChange={e => setCfg({ ...cfg, emailFrom: e.target.value as Severity })} style={{ ...inp, width: 180 }}>
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

      {/* ── Suspended-customer matches (migration 113) ── */}
      <div style={card}>
        <h2 style={h2}>POSSIBLE SUSPENDED CUSTOMERS</h2>
        <p style={{ ...small, marginTop: 0 }}>
          New bookings are checked against suspended accounts. Same card, phone or email (including Gmail variations) is blocked before payment; an Instagram or name + ZIP match goes through and lands here for you to check.
        </p>
        {matches.length === 0 ? <div style={small}>No matches yet.</div> : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {matches.map(m => (
              <div key={m.id} style={{ borderBottom: `1px solid ${C.line}`, paddingBottom: 8 }}>
                <div style={{ fontFamily: 'Inter', fontSize: 13 }}>
                  <span style={{ color: m.action === 'blocked' ? '#ef4444' : '#fbbf24', fontWeight: 700, fontSize: 11, letterSpacing: '0.08em', marginRight: 8 }}>{String(m.action).toUpperCase()}</span>
                  {m.booker} <span style={{ color: C.dim }}>matches</span> <strong>{m.customers?.name || m.customers?.email || 'a suspended account'}</strong>
                </div>
                <div style={small}>{m.detail} · {m.strength} · {m.where_seen} · {new Date(m.created_at).toLocaleString('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
              </div>
            ))}
          </div>
        )}
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
