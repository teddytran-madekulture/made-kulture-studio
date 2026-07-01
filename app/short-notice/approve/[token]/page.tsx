'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'

function fmt12(h: number) {
  const hr = Math.floor(h), mn = h % 1 ? '30' : '00'
  const ampm = hr >= 12 ? 'PM' : 'AM', h12 = hr % 12 === 0 ? 12 : hr % 12
  return `${h12}:${mn} ${ampm}`
}
function fmtDate(d: string) {
  return new Date(`${d}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
}
function plusDays(n: number) { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().split('T')[0] }

interface Req { customer_name: string; customer_email: string; desired_date: string | null; desired_start: number | null; note: string | null; status: string; granted_until: string | null }

export default function ApprovePage() {
  const params = useParams()
  const token = String(params.token)
  const [req, setReq]       = useState<Req | null>(null)
  const [loading, setLoad]  = useState(true)
  const [busy, setBusy]     = useState(false)
  const [done, setDone]     = useState<string | null>(null)   // 'approved' | 'denied'
  const [until, setUntil]   = useState('')
  const [err, setErr]       = useState('')

  useEffect(() => {
    fetch(`/api/short-notice/${token}`)
      .then(r => r.json())
      .then(d => { if (d.request) { setReq(d.request); if (d.request.status !== 'pending') setDone(d.request.status) } else setErr(d.error || 'Not found') })
      .catch(() => setErr('Could not load the request.'))
      .finally(() => setLoad(false))
  }, [token])

  const resolve = async (action: string, untilDate?: string) => {
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/short-notice/${token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, until: untilDate }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) setDone(d.status)
      else setErr(d.error || 'Something went wrong.')
    } catch { setErr('Something went wrong.') }
    finally { setBusy(false) }
  }

  const wrap: React.CSSProperties = { background: '#080808', minHeight: '100vh', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, fontFamily: 'Inter, sans-serif' }
  const box: React.CSSProperties = { maxWidth: 460, width: '100%', background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 28 }

  if (loading) return <div style={wrap}><div style={{ color: 'rgba(255,255,255,0.4)' }}>Loading…</div></div>

  if (err && !req) return <div style={wrap}><div style={box}><div style={{ color: '#ff6b6b' }}>{err}</div></div></div>

  if (done) return (
    <div style={wrap}><div style={box}>
      <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 30, letterSpacing: '0.02em', marginBottom: 8 }}>
        {done === 'approved' ? 'APPROVED ✓' : 'DENIED'}
      </div>
      <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
        {done === 'approved'
          ? `${req?.customer_name} can now book short-notice${req?.granted_until ? ` through ${fmtDate(req.granted_until)}` : ''}. They've been notified.`
          : `${req?.customer_name}'s request was denied.`}
      </p>
    </div></div>
  )

  return (
    <div style={wrap}><div style={box}>
      <div style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.35)', marginBottom: 10 }}>SHORT-NOTICE REQUEST</div>
      <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 28, letterSpacing: '0.02em', marginBottom: 4 }}>{req?.customer_name}</div>
      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)', marginBottom: 20 }}>{req?.customer_email}</div>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.1)', borderBottom: '1px solid rgba(255,255,255,0.1)', padding: '14px 0', marginBottom: 22, fontSize: 14 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: req?.note ? 8 : 0 }}>
          <span style={{ color: 'rgba(255,255,255,0.4)' }}>Wants</span>
          <span>{req?.desired_date ? `${fmtDate(req.desired_date)}${req.desired_start != null ? ' · ' + fmt12(req.desired_start) : ''}` : 'Any near-term slot'}</span>
        </div>
        {req?.note && <div style={{ color: 'rgba(255,255,255,0.6)', fontStyle: 'italic' }}>“{req.note}”</div>}
      </div>

      {err && <div style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 14 }}>{err}</div>}

      <button onClick={() => resolve('approve_48h')} disabled={busy}
        style={{ width: '100%', background: '#d4a843', color: '#080808', border: 'none', padding: '14px', cursor: busy ? 'default' : 'pointer', fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', marginBottom: 12, opacity: busy ? 0.6 : 1 }}>
        ALLOW · NEXT 48 HOURS
      </button>

      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <input type="date" value={until} min={plusDays(0)} onChange={e => setUntil(e.target.value)}
          style={{ flex: 1, background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '12px', fontFamily: 'Inter', fontSize: 14, boxSizing: 'border-box' }} />
        <button onClick={() => until ? resolve('approve_until', until) : setErr('Pick a date first.')} disabled={busy}
          style={{ background: 'transparent', border: '1px solid rgba(212,168,67,0.6)', color: '#d4a843', padding: '12px 16px', cursor: busy ? 'default' : 'pointer', fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', whiteSpace: 'nowrap' }}>
          ALLOW UNTIL
        </button>
      </div>

      <button onClick={() => resolve('deny')} disabled={busy}
        style={{ width: '100%', background: 'transparent', color: 'rgba(255,120,120,0.8)', border: '1px solid rgba(255,100,100,0.3)', padding: '11px', cursor: busy ? 'default' : 'pointer', fontFamily: 'Inter', fontSize: 12, letterSpacing: '0.12em' }}>
        Deny request
      </button>
    </div></div>
  )
}
