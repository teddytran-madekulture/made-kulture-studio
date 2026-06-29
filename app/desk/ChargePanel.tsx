'use client'

import { useEffect, useRef, useState } from 'react'

const C = { card: '#1a1a1c', line: '#2a2a2e', text: '#f4f4f5', dim: '#a1a1aa', accent: '#ef6354', good: '#22c55e', input: '#232327' }

type Status = 'idle' | 'starting' | 'waiting' | 'paid' | 'canceled' | 'error'

// Push an ad-hoc card charge to the paired Square Register, then poll for the result.
export default function ChargePanel() {
  const [open, setOpen] = useState(false)
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [msg, setMsg] = useState('')
  const [checkoutId, setCheckoutId] = useState<string | null>(null)
  const [hasDevice, setHasDevice] = useState<boolean | null>(null)
  const poll = useRef<ReturnType<typeof setInterval> | null>(null)

  // Re-check the paired Register whenever the panel opens (not just on first load),
  // so pairing done after the page loaded is picked up.
  useEffect(() => {
    if (!open) return
    fetch('/api/desk/terminal/device', { cache: 'no-store' })
      .then(r => r.json()).then(d => setHasDevice(!!d.device)).catch(() => setHasDevice(null))
  }, [open])

  useEffect(() => () => { if (poll.current) clearInterval(poll.current) }, [])

  const reset = () => { setStatus('idle'); setMsg(''); setCheckoutId(null); setAmount(''); setNote(''); if (poll.current) clearInterval(poll.current) }

  const start = async () => {
    const cents = Math.round(parseFloat(amount) * 100)
    if (!cents || cents < 100) { setStatus('error'); setMsg('Enter at least $1.00.'); return }
    setStatus('starting'); setMsg('')
    const r = await fetch('/api/desk/terminal/charge', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ amountCents: cents, note }) })
    const d = await r.json()
    if (!r.ok) { setStatus('error'); setMsg(d.error ?? 'Could not start the charge.'); return }
    setCheckoutId(d.checkoutId); setStatus('waiting'); setMsg('Tell the customer to tap or insert their card on the Register.')
    poll.current = setInterval(async () => {
      const s = await fetch(`/api/desk/terminal/charge/${d.checkoutId}`, { cache: 'no-store' }).then(x => x.json()).catch(() => null)
      if (!s) return
      if (s.status === 'COMPLETED') { setStatus('paid'); if (poll.current) clearInterval(poll.current) }
      else if (s.status === 'CANCELED' || s.status === 'CANCEL_REQUESTED') { setStatus('canceled'); if (poll.current) clearInterval(poll.current) }
    }, 2000)
  }

  const cancel = async () => {
    if (!checkoutId) return
    await fetch(`/api/desk/terminal/charge/${checkoutId}`, { method: 'DELETE' })
    setStatus('canceled'); if (poll.current) clearInterval(poll.current)
  }

  const box: React.CSSProperties = { background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18, marginBottom: 18 }
  const btn = (bg: string): React.CSSProperties => ({ padding: '10px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: bg, color: '#fff', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace', fontSize: 14 })

  if (!open) return (
    <button onClick={() => setOpen(true)} style={{ ...btn(C.accent), marginBottom: 18 }}>💳 Charge a card</button>
  )

  return (
    <div style={box}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <strong style={{ fontFamily: 'Anton, sans-serif', fontSize: 18 }}>CHARGE A CARD</strong>
        <button onClick={() => { reset(); setOpen(false) }} style={{ background: 'none', border: 'none', color: C.dim, cursor: 'pointer', fontSize: 18 }}>✕</button>
      </div>

      {hasDevice === false && <p style={{ color: C.accent, fontSize: 13 }}>No Register is paired yet — an owner can pair it from the staff console. (You can still try; the charge will tell you if it can’t reach a Register.)</p>}

      {(status === 'idle' || status === 'starting' || status === 'error') && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            <input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="Amount ($)"
              style={{ flex: '1 1 120px', padding: '10px 12px', background: C.input, border: `1px solid ${C.line}`, borderRadius: 8, color: C.text, fontSize: 16 }} />
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Note (optional)"
              style={{ flex: '2 1 200px', padding: '10px 12px', background: C.input, border: `1px solid ${C.line}`, borderRadius: 8, color: C.text, fontSize: 15 }} />
          </div>
          {status === 'error' && <p style={{ color: C.accent, fontSize: 13 }}>{msg}</p>}
          <button onClick={start} disabled={status === 'starting'} style={{ ...btn(C.accent), marginTop: 12, opacity: status === 'starting' ? 0.6 : 1 }}>
            {status === 'starting' ? 'Starting…' : 'Send to Register →'}
          </button>
        </>
      )}

      {status === 'waiting' && (
        <div>
          <p style={{ color: C.text }}>⏳ Waiting for payment on the Register…</p>
          <p style={{ color: C.dim, fontSize: 13 }}>{msg}</p>
          <button onClick={cancel} style={{ ...btn('transparent'), border: `1px solid ${C.accent}`, color: C.accent }}>Cancel charge</button>
        </div>
      )}
      {status === 'paid' && (
        <div>
          <p style={{ color: C.good, fontWeight: 700, fontSize: 18 }}>✓ Paid</p>
          <button onClick={reset} style={btn(C.accent)}>New charge</button>
        </div>
      )}
      {status === 'canceled' && (
        <div>
          <p style={{ color: C.dim, fontWeight: 700 }}>Charge canceled.</p>
          <button onClick={reset} style={btn(C.accent)}>Try again</button>
        </div>
      )}
    </div>
  )
}
