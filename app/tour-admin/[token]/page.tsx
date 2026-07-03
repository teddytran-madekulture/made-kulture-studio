'use client'

// Teddy's one-tap tour approval page (linked from push/SMS). Token = auth.

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

const GOLD = '#d4a843'

export default function TourAdminPage() {
  const { token } = useParams<{ token: string }>()
  const [req, setReq]       = useState<any>(null)
  const [error, setError]   = useState('')
  const [busy, setBusy]     = useState(false)
  const [done, setDone]     = useState<string | null>(null)

  useEffect(() => {
    fetch(`/api/tours/decide/${token}`)
      .then(r => r.json())
      .then(d => d.request ? setReq(d.request) : setError('Request not found.'))
      .catch(() => setError('Could not load the request.'))
  }, [token])

  const decide = async (action: 'approve' | 'decline') => {
    setBusy(true)
    const r = await fetch(`/api/tours/decide/${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action }),
    })
    const d = await r.json()
    if (r.ok) setDone(d.status)
    else if (d.status) setDone(d.status)
    else setError(d.error || 'Something went wrong.')
    setBusy(false)
  }

  const wrap: React.CSSProperties = {
    background: '#080808', minHeight: '100vh', color: '#fff',
    fontFamily: 'Inter, sans-serif', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
  }

  if (error) return <div style={wrap}><div style={{ color: 'rgba(255,255,255,0.6)' }}>{error}</div></div>
  if (!req) return <div style={wrap}><div style={{ color: 'rgba(255,255,255,0.4)' }}>Loading…</div></div>

  return (
    <div style={wrap}>
      <div style={{ maxWidth: 420, width: '100%', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10, padding: 28 }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.15em', color: GOLD, marginBottom: 14 }}>
          {req.is_custom ? '🚶 CUSTOM TOUR REQUEST' : '🚶 TOUR REQUEST'}
        </div>
        {req.is_custom && (
          <div style={{ fontSize: 12, color: '#fbbf24', background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 6, padding: '8px 12px', marginBottom: 14, lineHeight: 1.5 }}>
            Outside open shoot hours — approving means opening the studio for this.
          </div>
        )}
        <div style={{ fontSize: 20, fontWeight: 700, marginBottom: 6 }}>{req.whenLabel}</div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.75)', marginBottom: 4 }}>{req.name} · {req.phone}</div>
        {req.email && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 4 }}>{req.email}</div>}
        {req.purpose && <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.55)', marginTop: 8, lineHeight: 1.5 }}>Planning: {req.purpose}</div>}

        {done || req.status !== 'pending' ? (
          <div style={{ marginTop: 22, fontSize: 15, fontWeight: 600, color: (done ?? req.status) === 'approved' ? '#4ade80' : '#f87171' }}>
            {(done ?? req.status) === 'approved' ? '✅ Approved — they got a confirmation text.' : '✖ Declined — they were notified politely.'}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
            <button disabled={busy} onClick={() => decide('approve')} style={{
              flex: 1, background: '#4ade80', color: '#052e16', border: 'none', padding: '13px',
              fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em',
              borderRadius: 6, cursor: 'pointer',
            }}>APPROVE</button>
            <button disabled={busy} onClick={() => decide('decline')} style={{
              flex: 1, background: 'transparent', color: '#f87171', border: '1px solid rgba(239,68,68,0.5)', padding: '13px',
              fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 700, letterSpacing: '0.1em',
              borderRadius: 6, cursor: 'pointer',
            }}>DECLINE</button>
          </div>
        )}
      </div>
    </div>
  )
}
