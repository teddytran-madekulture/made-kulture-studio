'use client'
// Rewards on/off + rates. Lives on /admin/credit (Credit & Rewards) since
// 2026-09-27 — rewards are paid as studio credit, so the setting sits next to
// the balances. Reads/writes the same /api/admin/standing-settings endpoint the
// Account Standing page uses (the rewards block of it only).
import { useEffect, useState } from 'react'

const C = { card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#c9b27e' }
const inp: React.CSSProperties = { background: '#0b0b0d', border: `1px solid ${C.line}`, color: C.text, padding: '8px 10px', fontFamily: 'Inter, sans-serif', fontSize: 13, colorScheme: 'dark' }
const h2: React.CSSProperties = { fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 22, letterSpacing: '0.03em', margin: '0 0 12px' }
const card: React.CSSProperties = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 8, padding: 20, marginBottom: 24 }
const small: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.dim, lineHeight: 1.6 }

interface Rewards { enabled: boolean; memberRate: number; plusRate: number }

export default function RewardsSettings() {
  const [rw, setRw] = useState<Rewards | null>(null)
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch('/api/admin/standing-settings', { cache: 'no-store' }).then(async r => {
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setMsg(`⚠️ ${d.error || 'Could not load rewards settings.'}`); return }
      setRw(d.rewards)
    }).catch(() => setMsg('⚠️ Could not load rewards settings.'))
  }, [])

  const save = async (rewards: Partial<Rewards>, ok: string) => {
    setBusy(true); setMsg(null)
    try {
      const r = await fetch('/api/admin/standing-settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rewards }) })
      const d = await r.json()
      if (!r.ok) { setMsg(`⚠️ ${d.error || 'Not saved.'}`); return }
      setRw(d.rewards); setMsg(ok)
    } catch { setMsg('⚠️ Not saved — check your connection.') }
    finally { setBusy(false) }
  }

  return (
    <div style={card}>
      <h2 style={h2}>MADE KULTURE REWARDS</h2>
      {msg && <div style={{ ...small, color: msg.startsWith('⚠️') ? '#fbbf24' : '#4ade80', marginBottom: 12 }}>{msg}</div>}
      {!rw ? <div style={small}>{msg ? '' : 'Loading…'}</div> : (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, fontFamily: 'Inter', fontSize: 14, marginBottom: 14 }}>
            <input type="checkbox" checked={rw.enabled} disabled={busy}
              onChange={e => {
                const on = e.target.checked
                if (on && !window.confirm('Turn rewards ON? Bookings made from now on will earn credit after their session.')) return
                save({ enabled: on }, on ? 'Rewards are ON. New bookings earn from now.' : 'Rewards are OFF. Nothing new locks a rate.')
              }} />
            <span style={{ fontWeight: 600, color: rw.enabled ? '#4ade80' : C.dim }}>{rw.enabled ? 'ON — new bookings earn' : 'OFF — nothing earns'}</span>
          </label>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <label style={small}>Members %<br /><input type="number" min={0} max={50} step={0.5} value={rw.memberRate} onChange={e => setRw({ ...rw, memberRate: Number(e.target.value) })} style={{ ...inp, width: 90 }} /></label>
            <label style={small}>Plus %<br /><input type="number" min={0} max={50} step={0.5} value={rw.plusRate} onChange={e => setRw({ ...rw, plusRate: Number(e.target.value) })} style={{ ...inp, width: 90 }} /></label>
            <button disabled={busy} onClick={() => save({ memberRate: rw.memberRate, plusRate: rw.plusRate }, 'Rates saved. They apply to new bookings only.')}
              style={{ ...inp, cursor: 'pointer', background: C.accent, color: '#080808', fontWeight: 700, border: 'none', letterSpacing: '0.1em', fontSize: 11 }}>SAVE RATES</button>
          </div>
          <p style={{ ...small, marginTop: 12, marginBottom: 0 }}>
            Paid nightly after each session, only in good standing, on set time + gear paid by card. Reward credit expires after 12 months with no completed booking (30-day warning email first).
          </p>
        </>
      )}
    </div>
  )
}
