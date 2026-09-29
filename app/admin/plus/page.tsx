'use client'
// Plus Members — who has Plus, paid or comped, when it renews. Linked from BOTH admin sidebars.
// Grant / revoke still lives on the customer's panel in the dashboard Client List.
import { useEffect, useState } from 'react'

const C = { card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', gold: '#d4a843', goldSoft: '#e6c07a' }
const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: 16 }
const small: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.dim, lineHeight: 1.6 }
const money = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`
const day = (iso: string | null) => iso ? new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(iso)) : '—'

export default function PlusMembersPage() {
  const [d, setD] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const [unauth, setUnauth] = useState(false)
  const [showLapsed, setShowLapsed] = useState(false)

  useEffect(() => {
    (async () => {
      const r = await fetch('/api/admin/plus', { cache: 'no-store' })
      if (r.status === 401) { setUnauth(true); return }
      const j = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(j.error || 'Could not load Plus members.'); return }
      setD(j)
    })()
  }, [])

  if (unauth) return <div style={{ padding: 40, fontFamily: 'Inter' }}>Sign in to the admin first.</div>
  const members = (d?.members ?? []).filter((m: any) => showLapsed || m.active)
  const lapsed = (d?.members ?? []).filter((m: any) => !m.active).length

  return (
    <div style={{ padding: '32px 24px', maxWidth: 980, color: C.text }}>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: '0 0 6px' }}>PLUS MEMBERS</h1>
      <p style={{ ...small, margin: '0 0 20px' }}>Everyone with Plus, newest first. To grant or revoke, open the customer in the Client List.</p>
      {err && <div style={{ ...small, color: '#fbbf24', marginBottom: 16 }}>⚠️ {err}</div>}
      {!d && !err && <div style={small}>Loading…</div>}

      {d && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 24 }}>
          {[
            ['Active members', String(d.totals.active)],
            ['Paying', String(d.totals.paying)],
            ['Comped', String(d.totals.comped)],
            ['Collected (all time)', money(d.totals.collectedCents)],
          ].map(([k, v]) => (
            <div key={k} style={card}>
              <div style={small}>{k}</div>
              <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 28 }}>{v}</div>
            </div>
          ))}
        </div>
      )}

      {d && lapsed > 0 && (
        <label style={{ ...small, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={showLapsed} onChange={e => setShowLapsed(e.target.checked)} /> Show lapsed ({lapsed})
        </label>
      )}

      {d && members.length === 0 && <div style={{ ...card, ...small }}>No Plus members yet.</div>}

      <div style={{ display: 'grid', gap: 10 }}>
        {members.map((m: any) => (
          <div key={m.id} style={{ ...card, borderColor: m.active ? 'rgba(212,168,67,0.4)' : C.line, opacity: m.active ? 1 : 0.6 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 16, fontWeight: 600, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                {m.name || m.email}
                <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: '0.08em', padding: '1px 6px', color: m.active ? '#080808' : C.dim, background: m.active ? C.gold : 'transparent', border: `1px solid ${m.active ? C.gold : C.line}` }}>
                  {m.active ? (m.comp ? 'PLUS · COMP' : 'PLUS') : 'LAPSED'}
                </span>
              </div>
              <div style={{ ...small, color: C.goldSoft }}>{m.paidCents ? `${money(m.paidCents)} paid` : (m.comp ? 'comped' : '$0 recorded')}</div>
            </div>
            <div style={{ ...small, marginTop: 6 }}>
              {[m.email, m.phone].filter(Boolean).join(' · ')}
            </div>
            <div style={{ ...small, marginTop: 4 }}>
              Joined {day(m.startedAt)} · {m.active ? 'Renews' : 'Ended'} {day(m.expiresAt)}{m.active ? ` · auto-renew ${m.autoRenew ? 'on' : 'off'}` : ''}
              {m.renewalSuspended ? ' · ⚠ renewal suspended' : ''}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
