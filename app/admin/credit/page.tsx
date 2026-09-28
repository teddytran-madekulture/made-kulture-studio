'use client'
// Credit & Rewards — the rewards settings, every account holding credit, the full activity feed, and a
// CSV export for bookkeeping. Linked from BOTH admin sidebars.
import { useCallback, useEffect, useState } from 'react'
import RewardsSettings from '@/components/admin/RewardsSettings'

const C = { card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#c9b27e' }
const inp: React.CSSProperties = { background: '#0b0b0d', border: `1px solid ${C.line}`, color: C.text, padding: '8px 10px', fontFamily: 'Inter, sans-serif', fontSize: 13, colorScheme: 'dark' }
const opt: React.CSSProperties = { background: '#141416', color: '#fff' }
const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: 20, marginBottom: 24 }
const h2: React.CSSProperties = { fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 22, letterSpacing: '0.03em', margin: '0 0 12px' }
const small: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.dim, lineHeight: 1.6 }
const money = (c: number) => `${c < 0 ? '−' : ''}$${(Math.abs(c) / 100).toFixed(2)}`
const when = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
const KINDS: [string, string][] = [['', 'Everything'], ['reward', 'Rewards earned'], ['issued', 'Credit added (cancel / no-show)'], ['redeemed', 'Spent'], ['adjustment', 'Manual changes'], ['expired', 'Expired'], ['reward_reversed', 'Rewards removed']]

export default function CreditPage() {
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [d, setD] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const [unauth, setUnauth] = useState(false)
  const [onlyWithCredit, setOnlyWithCredit] = useState(true)

  const params = () => new URLSearchParams(Object.entries({ q, kind, from, to }).filter(([, v]) => v) as [string, string][]).toString()
  const load = useCallback(async () => {
    setErr(null)
    const r = await fetch(`/api/admin/credit?${params()}`, { cache: 'no-store' })
    if (r.status === 401) { setUnauth(true); return }
    const j = await r.json()
    if (!r.ok) { setErr(j.error || 'Could not load.'); return }
    setD(j)
  }, [q, kind, from, to]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t) }, [load])

  if (unauth) return <div style={{ padding: 40, fontFamily: 'Inter' }}>Sign in to the admin first.</div>
  const accounts = (d?.accounts ?? []).filter((a: any) => !onlyWithCredit || a.balanceCents !== 0)

  return (
    <div style={{ padding: '32px 24px', maxWidth: 980, color: C.text }}>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: '0 0 6px' }}>CREDIT &amp; REWARDS</h1>
      <p style={{ ...small, margin: '0 0 20px' }}>Every change to anyone's credit, newest first. Nothing here is ever edited — to fix something, add or remove credit from the customer's panel on the dashboard and it shows up below.</p>
      {err && <div style={{ ...small, color: '#fbbf24', marginBottom: 16 }}>⚠️ {err}</div>}

      <RewardsSettings />

      {d && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12, marginBottom: 24 }}>
          {[
            ['Credit outstanding', money(d.totals.outstandingCents), 'services you owe'],
            ['Of which rewards', money(d.totals.rewardOutstandingCents), 'expires after 12 months idle'],
            ['Rewards expiring ≤30 days', money(d.totals.expiringSoonCents), 'warning emails go out'],
            ['Accounts with credit', String(d.totals.accountsWithCredit), ''],
          ].map(([k, v, s]) => (
            <div key={k} style={{ ...card, marginBottom: 0, padding: 16 }}>
              <div style={small}>{k}</div>
              <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 28 }}>{v}</div>
              {s && <div style={{ ...small, fontSize: 11 }}>{s}</div>}
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 20 }}>
        <label style={small}>Search<br /><input value={q} onChange={e => setQ(e.target.value)} placeholder="name or email" style={{ ...inp, width: 200 }} /></label>
        <label style={small}>Type<br />
          <select value={kind} onChange={e => setKind(e.target.value)} style={{ ...inp, width: 210 }}>
            {KINDS.map(([v, l]) => <option key={v} value={v} style={opt}>{l}</option>)}
          </select>
        </label>
        <label style={small}>From<br /><input type="date" value={from} onChange={e => setFrom(e.target.value)} style={inp} /></label>
        <label style={small}>To<br /><input type="date" value={to} onChange={e => setTo(e.target.value)} style={inp} /></label>
        <a href={`/api/admin/credit?${params()}&format=csv`}
          style={{ ...inp, textDecoration: 'none', background: C.accent, color: '#080808', fontWeight: 700, border: 'none', fontSize: 11, letterSpacing: '0.1em' }}>
          EXPORT CSV
        </a>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
          <h2 style={h2}>ACCOUNTS</h2>
          <label style={{ ...small, display: 'flex', gap: 6, alignItems: 'center' }}>
            <input type="checkbox" checked={onlyWithCredit} onChange={e => setOnlyWithCredit(e.target.checked)} /> only with a balance
          </label>
        </div>
        {!d ? <div style={small}>Loading…</div> : accounts.length === 0 ? <div style={small}>Nobody matches.</div> : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontFamily: 'Inter, sans-serif', fontSize: 13 }}>
              <thead><tr style={{ color: C.dim, textAlign: 'left', fontSize: 11 }}>
                <th style={{ padding: '6px 8px' }}>Customer</th><th style={{ padding: '6px 8px', textAlign: 'right' }}>Balance</th>
                <th style={{ padding: '6px 8px', textAlign: 'right' }}>Rewards</th><th style={{ padding: '6px 8px' }}>Rewards expire</th><th style={{ padding: '6px 8px' }}>Last change</th>
              </tr></thead>
              <tbody>
                {accounts.map((a: any) => (
                  <tr key={a.authUserId} style={{ borderTop: `1px solid ${C.line}` }}>
                    <td style={{ padding: '8px' }}>{a.name || '—'}<div style={{ ...small, fontSize: 11 }}>{a.email}</div></td>
                    <td style={{ padding: '8px', textAlign: 'right', color: a.balanceCents > 0 ? '#d4a843' : C.text }}>{money(a.balanceCents)}</td>
                    <td style={{ padding: '8px', textAlign: 'right' }}>{money(a.rewardCents)}</td>
                    <td style={{ padding: '8px', ...small }}>{a.rewardExpiresAt ? when(a.rewardExpiresAt).split(',').slice(0, 2).join(',') : '—'}</td>
                    <td style={{ padding: '8px', ...small }}>{a.lastAt ? when(a.lastAt) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div style={card}>
        <h2 style={h2}>ACTIVITY{d ? <span style={{ ...small, fontFamily: 'Inter', marginLeft: 8 }}>{d.activityTotal > 300 ? `latest 300 of ${d.activityTotal} — export for all` : `${d.activityTotal} changes`}</span> : null}</h2>
        {d && d.activity.length === 0 ? <div style={small}>Nothing in this window.</div> : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {(d?.activity ?? []).map((r: any) => (
              <div key={r.id} style={{ display: 'flex', gap: 10, padding: '7px 0', borderBottom: `1px solid ${C.line}`, fontFamily: 'Inter, sans-serif', fontSize: 13, flexWrap: 'wrap' }}>
                <span style={{ ...small, width: 150, flexShrink: 0 }}>{when(r.created_at)}</span>
                <span style={{ width: 180, flexShrink: 0 }}>{r.name || r.email || '—'}</span>
                <span style={{ flex: 1, minWidth: 200, color: 'rgba(255,255,255,0.75)' }}>
                  {r.label}{r.reason ? <span style={{ color: C.dim }}> · {r.reason}</span> : null}
                  {r.created_by === 'admin' && <span style={{ color: '#9cc0ff', fontSize: 10, marginLeft: 6 }}>ADMIN</span>}
                </span>
                <span style={{ color: r.amount_cents >= 0 ? '#4ade80' : '#ff8a8a', whiteSpace: 'nowrap' }}>{r.amount_cents >= 0 ? '+' : ''}{money(r.amount_cents)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
