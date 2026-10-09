'use client'
// /admin/minis — every upcoming Mini Sessions day and its roster, so whoever is
// on the floor can see who is supposed to be there, when, and with how many.
import { useEffect, useState } from 'react'

const C = { bg: '#0b0b0d', card: '#141416', line: 'rgba(255,255,255,0.1)', text: '#f4f4f5', dim: 'rgba(255,255,255,0.45)', accent: '#c9b27e', green: '#7bd88f', red: '#ff8a80' }
const small: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 12, color: C.dim, lineHeight: 1.5 }
const fmtPhone = (s: string | null) => s && s.length === 10 ? `(${s.slice(0, 3)}) ${s.slice(3, 6)}-${s.slice(6)}` : (s ?? '')

export default function AdminMinisPage() {
  const [days, setDays] = useState<any[] | null>(null)
  const [err, setErr] = useState('')
  const [fee, setFee] = useState('')
  const [feeMsg, setFeeMsg] = useState('')
  useEffect(() => {
    fetch('/api/admin/minis', { cache: 'no-store' })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => { if (ok) { setDays(d.days); setFee(String(d.extraFee ?? 5)) } else setErr(d.error || 'Could not load.') })
      .catch(() => setErr('Could not load.'))
  }, [])
  const resolve = async (miniId: string, outcome: 'charged' | 'waive') => {
    const r = await fetch('/api/admin/minis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'resolve', miniId, outcome }) })
    const d = await r.json().catch(() => ({}))
    if (!r.ok) { setErr(d.error || 'Not saved.'); return }
    setDays(ds => ds?.map(x => x.id === miniId ? { ...x, roster: { ...x.roster, extraCharge: { ...x.roster.extraCharge, status: outcome === 'charged' ? 'charged' : 'none' } } } : x) ?? null)
  }
  const saveFee = async () => {
    setFeeMsg('')
    const r = await fetch('/api/admin/minis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ extraFee: fee }) })
    const d = await r.json().catch(() => ({}))
    setFeeMsg(r.ok ? 'Saved.' : (d.error || 'Not saved.'))
  }

  return (
    <main style={{ background: C.bg, color: C.text, minHeight: 'var(--vh-full)', padding: '28px clamp(16px, 3vw, 40px) 80px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, letterSpacing: '0.03em', margin: 0 }}>MINI SESSIONS</h1>
        <span style={small}>Photographers’ mini days and who’s coming. They set these up from their account; payment is theirs.</span>
      </div>
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', marginBottom: 20, ...small }}>
        <span>Extra guest fee (bigger groups, billed to the photographer after the session): $</span>
        <input value={fee} onChange={e => setFee(e.target.value.replace(/[^0-9]/g, ''))} style={{ width: 56, background: C.bg, border: `1px solid ${C.line}`, color: C.text, padding: '6px 8px', fontFamily: 'Inter, sans-serif' }} />
        <span>per extra person per slot</span>
        <button onClick={saveFee} style={{ ...small, background: 'transparent', border: `1px solid ${C.line}`, color: C.text, padding: '6px 12px', cursor: 'pointer' }}>SAVE</button>
        {feeMsg && <span style={{ color: feeMsg === 'Saved.' ? C.green : C.red }}>{feeMsg}</span>}
      </div>
      {err && <div style={{ ...small, color: C.red }}>{err}</div>}
      {!days && !err && <div style={small}>Loading…</div>}
      {days && days.length === 0 && <div style={small}>No upcoming mini session days.</div>}
      {days?.map(d => {
        const r = d.roster
        return (
          <section key={d.id} style={{ background: C.card, border: `1px solid ${C.line}`, padding: '16px 18px', marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', alignItems: 'baseline' }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{d.day} · {d.time} · {d.place}</div>
                <div style={small}>{d.photographer}{d.photographerPhone ? ` · ${fmtPhone(d.photographerPhone)}` : ''}{d.title ? ` · “${d.title}”` : ''}</div>
              </div>
              <div style={{ ...small, textAlign: 'right' }}>
                <span style={{ color: d.status === 'cancelled' || d.bookingStatus === 'cancelled' ? C.red : d.status === 'closed' ? C.dim : C.green, fontWeight: 700, letterSpacing: '0.06em' }}>
                  {d.status === 'cancelled' || d.bookingStatus === 'cancelled' ? 'CANCELLED' : d.status === 'closed' ? 'SIGN-UPS STOPPED' : 'OPEN'}
                </span>
                <div>{r.counts.booked} booked · {r.counts.open} open · crew {r.crew} · limit {r.limit}</div>
                {(r.counts.extraGuests > 0 || (r.extraCharge.status && r.extraCharge.status !== 'none')) && (
                  <div style={{ color: r.extraCharge.status === 'review' ? C.red : C.accent }}>
                    {r.counts.extraGuests} extra guest{r.counts.extraGuests === 1 ? '' : 's'} · ${(r.counts.extraCents / 100).toFixed(2)} · {
                      r.extraCharge.status === 'charged' ? 'charged' : r.extraCharge.status === 'link_sent' ? 'payment link sent, unpaid'
                      : r.extraCharge.status === 'review' ? 'NEEDS REVIEW — check Square before charging' : r.extraCharge.status === 'charging' ? 'charging…' : 'bills after the session'}
                    {(r.extraCharge.status === 'review' || r.extraCharge.status === 'link_sent') && (
                      <span style={{ marginLeft: 8 }}>
                        <button onClick={() => resolve(d.id, 'charged')} style={{ ...small, background: 'transparent', border: `1px solid ${C.line}`, color: C.text, padding: '3px 8px', cursor: 'pointer' }}>COLLECTED</button>{' '}
                        <button onClick={() => resolve(d.id, 'waive')} style={{ ...small, background: 'transparent', border: `1px solid ${C.line}`, color: C.text, padding: '3px 8px', cursor: 'pointer' }}>WAIVE</button>
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12, fontSize: 13 }}>
              <tbody>
                {r.slots.filter((s: any) => s.client).map((s: any) => (
                  <tr key={s.index} style={{ borderTop: `1px solid ${C.line}` }}>
                    <td style={{ padding: '7px 8px 7px 0', whiteSpace: 'nowrap', width: 150 }}>{s.label}</td>
                    <td style={{ padding: '7px 8px' }}>{s.client.name || '—'}{s.client.checkedIn && <span style={{ color: C.green, marginLeft: 8 }}>✓ here</span>}</td>
                    <td style={{ padding: '7px 8px', color: C.dim }}>party of {s.client.party}{s.client.extras > 0 && <span style={{ color: C.accent }}> (+{s.client.extras} extra)</span>}</td>
                    <td style={{ padding: '7px 8px', color: s.headcount > r.limit ? C.red : C.dim, whiteSpace: 'nowrap' }}>{s.headcount} of {r.limit} on set</td>
                    <td style={{ padding: '7px 0 7px 8px', color: C.dim }}>{fmtPhone(s.client.phone)}</td>
                  </tr>
                ))}
                {r.counts.booked === 0 && <tr><td style={{ ...small, padding: '8px 0' }}>No one booked yet.</td></tr>}
              </tbody>
            </table>
            {r.bumped.length > 0 && <div style={{ ...small, color: C.red, marginTop: 8 }}>{r.bumped.length} client{r.bumped.length === 1 ? '' : 's'} need a new time after the booking changed: {r.bumped.map((c: any) => c.name).join(', ')}</div>}
          </section>
        )
      })}
    </main>
  )
}
