'use client'
// One-line AI cost readout at the top of the June Inbox (migration 193).
// Tap to see the breakdown by feature. Shows an error rather than $0.00 when the
// read fails, so a broken tracker can never look like a free month.

import { useEffect, useState } from 'react'

const GOLD = '#d4a843'
const NAMES: Record<string, string> = {
  june_web: 'Website chat', june_kiosk: 'Kiosk chat', june_email: 'Email replies',
  june_coach: 'Coaching', june_question_review: 'Question review', polish: 'Spell check',
}
const usd = (n: number) => n < 10 ? `$${n.toFixed(2)}` : `$${Math.round(n)}`

export default function JuneCostStrip() {
  const [d, setD] = useState<any>(null)
  const [err, setErr] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    fetch('/api/admin/ai-usage', { cache: 'no-store' })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `HTTP ${r.status}`); setD(j) })
      .catch(e => setErr(String(e?.message || e)))
  }, [])

  const box: React.CSSProperties = {
    flexShrink: 0, marginBottom: 16, padding: '10px 14px', borderRadius: 4,
    border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)',
    fontSize: 12, letterSpacing: '0.04em', color: 'rgba(255,255,255,0.7)',
  }
  if (err) return <div style={{ ...box, color: '#f87171' }}>AI cost: could not load ({err})</div>
  if (!d) return <div style={box}>AI cost: loading…</div>

  const m = d.thisMonth
  return (
    <div style={box}>
      <button onClick={() => setOpen(o => !o)} style={{ all: 'unset', cursor: 'pointer', display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ color: GOLD, fontWeight: 700, letterSpacing: '0.12em' }}>AI COST</span>
        <span>Today <b style={{ color: '#fff' }}>{usd(d.today.cost)}</b></span>
        <span>This month <b style={{ color: '#fff' }}>{usd(m.cost)}</b></span>
        <span>{m.chats} chat{m.chats === 1 ? '' : 's'}{d.perChat != null ? ` · ~${usd(d.perChat)} each` : ''}</span>
        <span>Last month <b style={{ color: '#fff' }}>{usd(d.lastMonth.cost)}</b></span>
        <span style={{ color: 'rgba(255,255,255,0.4)' }}>{open ? '▲' : '▼ details'}</span>
      </button>
      {open && (
        <div style={{ marginTop: 10, display: 'grid', gap: 4 }}>
          {d.byFeature.length === 0 && <div>Nothing recorded this month yet.</div>}
          {d.byFeature.map((f: any) => (
            <div key={f.feature} style={{ display: 'flex', justifyContent: 'space-between', maxWidth: 360 }}>
              <span>{NAMES[f.feature] || f.feature} <span style={{ color: 'rgba(255,255,255,0.4)' }}>({f.calls} calls)</span></span>
              <b style={{ color: '#fff' }}>{usd(f.cost)}</b>
            </div>
          ))}
          {m.unpriced > 0 && <div style={{ color: '#fbbf24' }}>{m.unpriced} calls on a model with no price set in lib/ai-usage.ts, not counted.</div>}
          <div style={{ color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>Tracking started Nov 25, 2026. Earlier usage is only in the Anthropic console.</div>
        </div>
      )}
    </div>
  )
}
