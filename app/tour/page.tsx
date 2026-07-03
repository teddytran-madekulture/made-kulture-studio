'use client'

// Public tour booking page — free 30-min tours.
// Listed slots = times the studio is already open for shoots (easy approvals).
// Custom requests = any other date/time, flagged for Teddy's judgment.

import { useCallback, useEffect, useState } from 'react'

const GOLD = '#d4a843'

interface Slot { startISO: string; label: string }

function next14Days(): { date: string; label: string }[] {
  const out: { date: string; label: string }[] = []
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
  const base = Date.parse(`${today}T12:00:00Z`)
  for (let i = 0; i < 14; i++) {
    const d = new Date(base + i * 86_400_000)
    out.push({
      date: d.toISOString().slice(0, 10),
      label: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(d),
    })
  }
  return out
}

const CUSTOM_TIMES: { value: string; label: string }[] = []
for (let h = 9; h <= 21; h++) {
  for (const m of [0, 30]) {
    if (h === 21 && m > 30) continue
    const label = `${h % 12 === 0 ? 12 : h % 12}:${m === 0 ? '00' : '30'} ${h < 12 ? 'AM' : 'PM'}`
    CUSTOM_TIMES.push({ value: `${String(h).padStart(2, '0')}:${m === 0 ? '00' : '30'}`, label })
  }
}

export default function TourPage() {
  const days = next14Days()
  const [mode, setMode]         = useState<'slots' | 'custom'>('slots')
  const [date, setDate]         = useState(days[0].date)
  const [slots, setSlots]       = useState<Slot[] | null>(null)
  const [picked, setPicked]     = useState<string | null>(null)   // startISO
  const [customTime, setCustomTime] = useState('12:00')
  const [name, setName]         = useState('')
  const [phone, setPhone]       = useState('')
  const [email, setEmail]       = useState('')
  const [purpose, setPurpose]   = useState('')
  const [busy, setBusy]         = useState(false)
  const [doneMsg, setDoneMsg]   = useState<string | null>(null)
  const [error, setError]       = useState('')

  const loadSlots = useCallback(async (d: string) => {
    setSlots(null)
    setPicked(null)
    try {
      const r = await fetch(`/api/tours/slots?date=${d}`)
      const data = await r.json()
      setSlots(data.slots ?? [])
    } catch { setSlots([]) }
  }, [])

  useEffect(() => { if (mode === 'slots') loadSlots(date) }, [date, mode, loadSlots])

  const submit = async () => {
    setError('')
    let startISO: string | null = null
    if (mode === 'slots') {
      startISO = picked
      if (!startISO) { setError('Pick a time slot first.'); return }
    } else {
      // Custom: Houston-local time → ISO with Central offset handled server-side
      // via a full ISO string; -05:00 covers CDT (studio summer default).
      startISO = `${date}T${customTime}:00-05:00`
    }
    if (!name.trim() || !phone.trim()) { setError('Name and phone number are required.'); return }
    setBusy(true)
    try {
      const r = await fetch('/api/tours/request', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, email, purpose, startISO }),
      })
      const d = await r.json()
      if (r.ok) setDoneMsg(d.message)
      else setError(d.error || 'Something went wrong — text us at (832) 408-1631.')
    } catch { setError('Connection problem — try again or text (832) 408-1631.') }
    setBusy(false)
  }

  const input: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box', background: 'rgba(255,255,255,0.05)',
    border: '1px solid rgba(255,255,255,0.15)', color: '#fff', fontFamily: 'Inter, sans-serif',
    fontSize: 14, padding: '12px 14px', outline: 'none', borderRadius: 6, marginBottom: 12,
  }
  const chip = (active: boolean): React.CSSProperties => ({
    padding: '10px 14px', cursor: 'pointer', borderRadius: 6, fontFamily: 'Inter, sans-serif',
    fontSize: 13, fontWeight: 600, border: active ? `1px solid ${GOLD}` : '1px solid rgba(255,255,255,0.15)',
    background: active ? 'rgba(212,168,67,0.15)' : 'transparent', color: active ? GOLD : 'rgba(255,255,255,0.7)',
  })

  if (doneMsg) return (
    <main style={{ background: '#080808', minHeight: '100vh', color: '#fff', fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ maxWidth: 440, textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 16 }}>🎬</div>
        <h1 style={{ fontSize: 22, letterSpacing: '0.06em', marginBottom: 12 }}>REQUEST SENT</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>{doneMsg}</p>
        <a href="/" style={{ display: 'inline-block', marginTop: 20, color: GOLD, fontSize: 13 }}>← Back to Made Kulture</a>
      </div>
    </main>
  )

  return (
    <main style={{ background: '#080808', minHeight: '100vh', color: '#fff', fontFamily: 'Inter, sans-serif', padding: '48px 20px' }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <a href="/" style={{ color: 'rgba(255,255,255,0.45)', textDecoration: 'none', fontSize: 13 }}>← Made Kulture</a>
        <h1 style={{ fontSize: 26, letterSpacing: '0.08em', margin: '18px 0 8px' }}>TOUR THE STUDIO</h1>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, marginBottom: 26 }}>
          Free 30-minute walkthrough of all nine sets. Pick a time below — we confirm every tour by text, usually fast.
        </p>

        {/* Mode toggle */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
          <button style={chip(mode === 'slots')} onClick={() => setMode('slots')}>Available times</button>
          <button style={chip(mode === 'custom')} onClick={() => setMode('custom')}>Request a custom time</button>
        </div>

        {/* Date strip */}
        <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 8, marginBottom: 16 }}>
          {days.map(d => (
            <button key={d.date} style={{ ...chip(date === d.date), whiteSpace: 'nowrap', flexShrink: 0 }} onClick={() => setDate(d.date)}>
              {d.label}
            </button>
          ))}
        </div>

        {mode === 'slots' ? (
          <div style={{ marginBottom: 20 }}>
            {slots === null && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>Checking the schedule…</div>}
            {slots !== null && slots.length === 0 && (
              <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6, border: '1px solid rgba(255,255,255,0.1)', borderRadius: 6, padding: 14 }}>
                The studio isn't scheduled to be open that day. Try another date — or switch to{' '}
                <button onClick={() => setMode('custom')} style={{ background: 'none', border: 'none', color: GOLD, cursor: 'pointer', fontSize: 13, padding: 0, fontFamily: 'Inter, sans-serif' }}>
                  request a custom time
                </button>{' '}and we'll see what we can do.
              </div>
            )}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(slots ?? []).map(s => (
                <button key={s.startISO} style={chip(picked === s.startISO)} onClick={() => setPicked(s.startISO)}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 12, color: '#fbbf24', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 6, padding: '10px 12px', marginBottom: 14, lineHeight: 1.5 }}>
              Custom times depend on our schedule that day — we'll text you either way.
            </div>
            <select value={customTime} onChange={e => setCustomTime(e.target.value)} style={{ ...input, width: 180 }}>
              {CUSTOM_TIMES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
        )}

        {/* Contact */}
        <input style={input} placeholder="Your name *" value={name} onChange={e => setName(e.target.value)} maxLength={80} />
        <input style={input} placeholder="Phone (for the confirmation text) *" value={phone} onChange={e => setPhone(e.target.value)} maxLength={20} />
        <input style={input} placeholder="Email (optional)" value={email} onChange={e => setEmail(e.target.value)} maxLength={120} />
        <input style={input} placeholder="What are you planning to shoot? (optional)" value={purpose} onChange={e => setPurpose(e.target.value)} maxLength={300} />

        {error && <div style={{ color: '#f87171', fontSize: 13, marginBottom: 12 }}>{error}</div>}

        <button
          disabled={busy}
          onClick={submit}
          style={{
            width: '100%', background: GOLD, color: '#080808', border: 'none', padding: '15px',
            fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 700, letterSpacing: '0.12em',
            borderRadius: 6, cursor: 'pointer',
          }}
        >
          {busy ? 'SENDING…' : 'REQUEST TOUR'}
        </button>
        <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 12, lineHeight: 1.5 }}>
          Tours are confirmed by text. Questions? Text (832) 408-1631.
        </p>
      </div>
    </main>
  )
}
