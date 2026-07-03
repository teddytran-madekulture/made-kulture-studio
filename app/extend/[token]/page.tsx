'use client'

// Customer-facing extension confirm page — opened from the SMS link on the
// booking holder's own phone. Matches the kiosk's luxury-dark language.

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'

const CHAMP = '#c9b27e'
const INK = '#0b0b0d'

export default function ExtendConfirmPage() {
  const { token } = useParams<{ token: string }>()
  const [req, setReq]     = useState<any>(null)
  const [error, setError] = useState('')
  const [busy, setBusy]   = useState(false)
  const [done, setDone]   = useState<string | null>(null) // "until" label

  useEffect(() => {
    fetch(`/api/extensions/${token}`)
      .then(r => r.json())
      .then(d => d.request ? setReq(d.request) : setError('Request not found.'))
      .catch(() => setError('Could not load the request.'))
  }, [token])

  const confirm = async () => {
    setBusy(true); setError('')
    try {
      const r = await fetch(`/api/extensions/${token}`, { method: 'POST' })
      const d = await r.json()
      if (r.ok) setDone(d.until ?? '')
      else setError(d.error || 'Something went wrong — text (832) 408-1631.')
    } catch { setError('Connection problem — try again.') }
    setBusy(false)
  }

  const wrap: React.CSSProperties = {
    background: 'radial-gradient(120% 90% at 85% -10%, #191510 0%, #0d0d10 45%, #09090b 100%)',
    minHeight: '100vh', color: '#fff', fontFamily: 'Inter, sans-serif',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
  }

  if (error && !req) return <div style={wrap}><div style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>{error}</div></div>
  if (!req) return <div style={wrap}><div style={{ color: 'rgba(255,255,255,0.35)' }}>Loading…</div></div>

  const dead = req.status === 'expired' || req.status === 'cancelled' || req.status === 'failed'

  return (
    <div style={wrap}>
      <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <div style={{ fontWeight: 900, letterSpacing: '0.3em', fontSize: 17, marginBottom: 6 }}>MADE KULTURE</div>
        <div style={{ fontSize: 10, color: 'rgba(201,178,126,0.55)', letterSpacing: '0.4em', marginBottom: 30 }}>SESSION EXTENSION</div>

        {done !== null || req.status === 'confirmed' ? (
          <>
            <div style={{ fontSize: 11, letterSpacing: '0.34em', color: 'rgba(201,178,126,0.6)', marginBottom: 16 }}>CONFIRMED</div>
            <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.4 }}>
              {req.setName ? `${req.setName} is yours` : 'Extended'}{done ? ` until ${done}` : ''}
            </div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 12 }}>
              ${req.amount} charged to your card on file. Enjoy the extra time.
            </div>
          </>
        ) : dead ? (
          <>
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
              {req.status === 'expired' ? 'This link expired' : 'This request is no longer active'}
            </div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>
              Ask June at the front-desk tablet to send a fresh one, or text (832) 408-1631.
            </div>
          </>
        ) : (
          <>
            <div style={{
              border: '1px solid rgba(201,178,126,0.25)', borderRadius: 18, padding: '26px 22px',
              background: 'linear-gradient(150deg, rgba(255,255,255,0.05), rgba(201,178,126,0.04))', marginBottom: 22,
            }}>
              <div style={{ fontSize: 26, fontWeight: 800 }}>+{req.hours} hour{req.hours > 1 ? 's' : ''}</div>
              {req.setName && <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', marginTop: 6 }}>{req.setName}{req.newEndLabel ? ` · until ${req.newEndLabel}` : ''}</div>}
              <div style={{ fontSize: 20, color: CHAMP, fontWeight: 700, marginTop: 14 }}>${req.amount}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>charged to your card on file</div>
            </div>
            {error && <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>{error}</div>}
            <button disabled={busy} onClick={confirm} style={{
              width: '100%', background: 'linear-gradient(135deg, #d7c08b, #9c8250)', color: INK,
              border: 'none', padding: '17px', borderRadius: 14, fontFamily: 'Inter, sans-serif',
              fontSize: 14, fontWeight: 800, letterSpacing: '0.14em', cursor: 'pointer',
            }}>
              {busy ? 'PROCESSING…' : 'CONFIRM & PAY'}
            </button>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 14, lineHeight: 1.6 }}>
              Didn't request this? Just close this page — nothing is charged unless you confirm.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
