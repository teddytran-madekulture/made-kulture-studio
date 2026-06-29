'use client'

import { useEffect, useRef, useState } from 'react'

const C = { card: '#1a1a1c', line: '#2a2a2e', text: '#f4f4f5', dim: '#a1a1aa', accent: '#ef6354', good: '#22c55e' }
const btn = (bg = C.accent): React.CSSProperties => ({ padding: '10px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', background: bg, color: '#fff', fontWeight: 600, fontFamily: 'JetBrains Mono, monospace', fontSize: 14 })

// Owner-only: pair the Square Register so the desk can push charges to it.
export default function TerminalPairing() {
  const [device, setDevice] = useState<{ label: string; device_id: string } | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [status, setStatus] = useState<string>('')
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  const poll = useRef<ReturnType<typeof setInterval> | null>(null)

  const loadDevice = () => fetch('/api/desk/terminal/device', { cache: 'no-store' }).then(r => r.json()).then(d => setDevice(d.device)).catch(() => {})
  useEffect(() => { loadDevice(); return () => { if (poll.current) clearInterval(poll.current) } }, [])

  const startPair = async () => {
    setBusy(true); setErr(''); setStatus('')
    const r = await fetch('/api/desk/terminal/pair', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ label: 'Front Desk Register' }) })
    const d = await r.json(); setBusy(false)
    if (!r.ok) { setErr(d.error ?? 'Could not start pairing.'); return }
    setCode(d.code); setStatus('Waiting for the Register…')
    poll.current = setInterval(async () => {
      const s = await fetch(`/api/desk/terminal/pair?id=${d.id}&label=Front%20Desk%20Register`, { cache: 'no-store' }).then(x => x.json()).catch(() => null)
      if (!s) return
      if (s.status === 'PAIRED') { setStatus(''); setCode(null); setDevice(s.device); if (poll.current) clearInterval(poll.current) }
      else if (s.status === 'EXPIRED') { setStatus('Code expired — tap Pair again and enter the new code promptly.'); setCode(null); if (poll.current) clearInterval(poll.current) }
      else setStatus(`Waiting… (${s.status})`)
    }, 3000)
  }

  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontFamily: 'Anton, sans-serif', fontSize: 20, margin: '0 0 12px' }}>SQUARE REGISTER</h2>
      <div style={{ background: C.card, border: `1px solid ${C.line}`, borderRadius: 12, padding: 18 }}>
        {device
          ? <p style={{ margin: 0, color: C.good }}>✓ Paired — <span style={{ color: C.text }}>{device.label}</span> <span style={{ color: C.dim, fontSize: 12 }}>({device.device_id})</span></p>
          : <p style={{ margin: '0 0 10px', color: C.dim }}>No Register paired yet. Pairing lets the front desk push charges to the Register.</p>}

        {code && (
          <div style={{ margin: '14px 0' }}>
            <p style={{ color: C.dim, fontSize: 13, margin: '0 0 6px' }}>On the Square Register, open the option to <strong style={{ color: C.text }}>connect to a POS application / enter a device code</strong> (in the Register’s settings), then enter this code <strong style={{ color: C.text }}>promptly</strong> (it expires in a few minutes):</p>
            <div style={{ fontFamily: 'JetBrains Mono, monospace', fontSize: 34, letterSpacing: '0.18em', color: C.accent, fontWeight: 700 }}>{code}</div>
          </div>
        )}
        {status && <p style={{ color: status.includes('expired') ? C.accent : C.dim, fontSize: 13 }}>{status}</p>}
        {err && <p style={{ color: C.accent, fontSize: 13 }}>{err}</p>}

        <button onClick={startPair} disabled={busy} style={{ ...btn(), marginTop: 8 }}>
          {device ? 'Re-pair Register' : busy ? 'Starting…' : 'Pair Register'}
        </button>
      </div>
    </section>
  )
}
