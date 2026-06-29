'use client'
import { useEffect, useState } from 'react'

interface CheckinData {
  name: string | null
  setName: string
  startTime: string
  endTime: string
  status: string
  declaredGuests: number | null
  arrivedGuests: number | null
  checkedInAt: string | null
  checkedOutAt: string | null
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
const fmtDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })

export default function CheckinPage({ params }: { params: { token: string } }) {
  const [data, setData]       = useState<CheckinData | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [guests, setGuests]   = useState(1)
  const [busy, setBusy]       = useState(false)
  const [err, setErr]         = useState<string | null>(null)
  const [checkedIn, setCheckedIn]   = useState(false)
  const [checkedOut, setCheckedOut] = useState(false)

  const load = () => {
    fetch(`/api/checkin/${params.token}`, { cache: 'no-store' })
      .then(r => { if (!r.ok) throw new Error(); return r.json() })
      .then((d: CheckinData) => {
        setData(d)
        setGuests(d.declaredGuests ?? 1)
        setCheckedIn(!!d.checkedInAt)
        setCheckedOut(!!d.checkedOutAt)
      })
      .catch(() => setNotFound(true))
  }
  useEffect(load, [params.token])

  const act = async (action: 'check_in' | 'check_out') => {
    setBusy(true); setErr(null)
    try {
      const res = await fetch(`/api/checkin/${params.token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, guests: action === 'check_in' ? guests : undefined }),
      })
      const d = await res.json()
      if (!res.ok) { setErr(d.error || 'Something went wrong.'); setBusy(false); return }
      if (action === 'check_in') setCheckedIn(true)
      else setCheckedOut(true)
      setBusy(false)
    } catch {
      setErr('Something went wrong. Please try again.'); setBusy(false)
    }
  }

  const wrap = (children: React.ReactNode) => (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#fff', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center' }}>
      <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 22, letterSpacing: '0.05em', marginBottom: 40, lineHeight: 1 }}>MADE<br />KULTURE</div>
      <div style={{ width: '100%', maxWidth: 420 }}>{children}</div>
    </div>
  )

  const label = { fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.4)' } as const
  const bigBtn = (bg: string, color: string) => ({
    width: '100%', padding: '20px', border: 'none', background: bg, color,
    fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 14, fontWeight: 600, letterSpacing: '0.2em',
    cursor: busy ? 'wait' : 'pointer', opacity: busy ? 0.6 : 1,
  } as const)

  if (notFound) return wrap(<p style={{ color: 'rgba(255,255,255,0.6)', fontFamily: 'Inter' }}>We couldn’t find that booking. Text us at (832) 408-1631.</p>)
  if (!data) return wrap(<p style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter' }}>Loading…</p>)

  const summary = (
    <div style={{ border: '1px solid rgba(255,255,255,0.1)', padding: '18px 20px', marginBottom: 28, textAlign: 'left' }}>
      <div style={{ ...label, marginBottom: 6 }}>{fmtDay(data.startTime)}</div>
      <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 28, lineHeight: 1, marginBottom: 6 }}>{data.setName.toUpperCase()}</div>
      <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>{fmt(data.startTime)} – {fmt(data.endTime)}</div>
    </div>
  )

  // ── Checked out ──
  if (checkedOut) return wrap(<>
    <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 48, lineHeight: 0.95, marginBottom: 16 }}>SEE YOU<br />NEXT TIME.</h1>
    <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.5)' }}>You’re checked out. Thanks for keeping the space clean.</p>
  </>)

  // ── Checked in → cleanup + check out ──
  if (checkedIn) return wrap(<>
    <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 44, lineHeight: 0.95, marginBottom: 16 }}>YOU’RE IN.</h1>
    <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.55)', marginBottom: 28 }}>{data.name ? `Welcome, ${data.name.split(' ')[0]}. ` : ''}The owner has been notified.</p>
    {summary}
    <div style={{ ...label, marginBottom: 10, textAlign: 'left' }}>BEFORE YOU CHECK OUT</div>
    <ul style={{ textAlign: 'left', fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.8, margin: '0 0 28px', paddingLeft: 18 }}>
      <li>Return all props to where you found them</li>
      <li>Take all your gear and trash with you</li>
      <li>Turn off any lights/equipment you used</li>
    </ul>
    {err && <p style={{ color: '#f0a0a0', fontFamily: 'Inter', fontSize: 13, marginBottom: 12 }}>{err}</p>}
    <button onClick={() => act('check_out')} disabled={busy} style={{ ...bigBtn('transparent', '#fff'), border: '1px solid rgba(255,255,255,0.3)' }}>
      {busy ? 'SAVING…' : 'CHECK OUT'}
    </button>
  </>)

  // ── Not yet checked in ──
  return wrap(<>
    <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 44, lineHeight: 0.95, marginBottom: 16 }}>WELCOME{data.name ? `,\n${data.name.split(' ')[0].toUpperCase()}` : ''}</h1>
    {summary}
    <div style={{ ...label, marginBottom: 12, textAlign: 'left' }}>HOW MANY PEOPLE ARE HERE?</div>
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 8 }}>
      <button onClick={() => setGuests(g => Math.max(1, g - 1))} style={{ width: 52, height: 52, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 24, cursor: 'pointer' }}>−</button>
      <span style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 48, minWidth: 60 }}>{guests}</span>
      <button onClick={() => setGuests(g => Math.min(30, g + 1))} style={{ width: 52, height: 52, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 24, cursor: 'pointer' }}>+</button>
    </div>
    {data.declaredGuests != null && guests > data.declaredGuests && (
      <p style={{ fontFamily: 'Inter', fontSize: 12, color: '#e0a44c', marginBottom: 16 }}>Heads up: you booked for {data.declaredGuests}. Extra guests may be charged.</p>
    )}
    <div style={{ height: 16 }} />
    {err && <p style={{ color: '#f0a0a0', fontFamily: 'Inter', fontSize: 13, marginBottom: 12 }}>{err}</p>}
    <button onClick={() => act('check_in')} disabled={busy} style={bigBtn('#fff', '#080808')}>
      {busy ? 'CHECKING IN…' : 'CHECK IN'}
    </button>
  </>)
}
