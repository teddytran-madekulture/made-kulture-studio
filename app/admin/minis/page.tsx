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
  useEffect(() => {
    fetch('/api/admin/minis', { cache: 'no-store' })
      .then(r => r.json().then(d => ({ ok: r.ok, d })))
      .then(({ ok, d }) => ok ? setDays(d.days) : setErr(d.error || 'Could not load.'))
      .catch(() => setErr('Could not load.'))
  }, [])

  return (
    <main style={{ background: C.bg, color: C.text, minHeight: 'var(--vh-full)', padding: '28px clamp(16px, 3vw, 40px) 80px', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, flexWrap: 'wrap', marginBottom: 18 }}>
        <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 34, letterSpacing: '0.03em', margin: 0 }}>MINI SESSIONS</h1>
        <span style={small}>Photographers’ mini days and who’s coming. They set these up from their account; payment is theirs.</span>
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
              </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12, fontSize: 13 }}>
              <tbody>
                {r.slots.filter((s: any) => s.client).map((s: any) => (
                  <tr key={s.index} style={{ borderTop: `1px solid ${C.line}` }}>
                    <td style={{ padding: '7px 8px 7px 0', whiteSpace: 'nowrap', width: 150 }}>{s.label}</td>
                    <td style={{ padding: '7px 8px' }}>{s.client.name || '—'}{s.client.checkedIn && <span style={{ color: C.green, marginLeft: 8 }}>✓ here</span>}</td>
                    <td style={{ padding: '7px 8px', color: C.dim }}>party of {s.client.party}</td>
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
