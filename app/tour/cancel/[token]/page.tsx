'use client'

// Customer-facing tour cancellation page (linked from their confirmation SMS).

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

const GOLD = '#d4a843'

export default function TourCancelPage() {
  const { token } = useParams<{ token: string }>()
  const [tour, setTour]   = useState<any>(null)
  const [error, setError] = useState('')
  const [busy, setBusy]   = useState(false)
  const [done, setDone]   = useState(false)

  useEffect(() => {
    fetch(`/api/tours/cancel/${token}`)
      .then(r => r.json())
      .then(d => d.tour ? setTour(d.tour) : setError('Tour not found.'))
      .catch(() => setError('Could not load your tour.'))
  }, [token])

  const cancel = async () => {
    setBusy(true)
    const r = await fetch(`/api/tours/cancel/${token}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ by: 'customer' }),
    })
    if (r.ok) setDone(true)
    else setError('Something went wrong — text (832) 408-1631 and we\'ll sort it out.')
    setBusy(false)
  }

  const wrap: React.CSSProperties = {
    background: '#080808', minHeight: '100vh', color: '#fff', fontFamily: 'Inter, sans-serif',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
  }

  if (error) return <div style={wrap}><div style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>{error}</div></div>
  if (!tour) return <div style={wrap}><div style={{ color: 'rgba(255,255,255,0.4)' }}>Loading…</div></div>

  return (
    <div style={wrap}>
      <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
        {done || tour.status === 'cancelled' ? (
          <>
            <div style={{ fontSize: 36, marginBottom: 14 }}>👋</div>
            <h1 style={{ fontSize: 20, letterSpacing: '0.06em', marginBottom: 10 }}>TOUR CANCELLED</h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', lineHeight: 1.6 }}>
              No worries — come by another time. You can always grab a new slot.
            </p>
            <a href="/tour" style={{ display: 'inline-block', marginTop: 18, background: GOLD, color: '#080808', textDecoration: 'none', fontWeight: 700, fontSize: 13, letterSpacing: '0.08em', padding: '12px 22px', borderRadius: 6 }}>
              BOOK A NEW TOUR
            </a>
          </>
        ) : (
          <>
            <div style={{ fontSize: 36, marginBottom: 14 }}>🚶</div>
            <h1 style={{ fontSize: 20, letterSpacing: '0.06em', marginBottom: 10 }}>CANCEL YOUR TOUR?</h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6, marginBottom: 8 }}>
              {tour.name} — {tour.whenLabel}
            </p>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 22 }}>
              This lets the studio know you can't make it.
            </p>
            <button disabled={busy} onClick={cancel} style={{
              background: 'transparent', color: '#f87171', border: '1px solid rgba(239,68,68,0.5)',
              padding: '13px 26px', fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 700,
              letterSpacing: '0.1em', borderRadius: 6, cursor: 'pointer',
            }}>
              {busy ? 'CANCELLING…' : 'YES, CANCEL MY TOUR'}
            </button>
            <div style={{ marginTop: 16 }}>
              <a href="/" style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Keep my tour</a>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
