'use client'

// Customer-facing confirm-and-pay page — opened from the SMS link on the booking
// holder's own phone. Matches the kiosk's luxury-dark language.
//
// Handles both kinds of request:
//   'extend'  — "add 1 hour, yours until 6:00 PM"
//   'overage' — "your session ran over, here's the 30 minutes to settle"
//
// And both ways of paying: one tap on the card on file, or a Square-hosted card
// field when there isn't one. The raw card number never touches our servers —
// Square tokenizes it in the browser and we only ever send the nonce.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'

const CHAMP = '#c9b27e'
const INK = '#0b0b0d'

declare global {
  interface Window { Square?: any }
}

function loadSquareScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Square) { resolve(); return }
    const appId = process.env.NEXT_PUBLIC_SQUARE_APP_ID ?? ''
    const src = appId.startsWith('sandbox-')
      ? 'https://sandbox.web.squarecdn.com/v1/square.js'
      : 'https://web.squarecdn.com/v1/square.js'
    const s = document.createElement('script')
    s.src = src
    s.onload = () => resolve()
    s.onerror = () => reject(new Error('Failed to load Square.js'))
    document.head.appendChild(s)
  })
}

export default function ExtendConfirmPage() {
  const { token } = useParams<{ token: string }>()
  const [req, setReq]     = useState<any>(null)
  const [error, setError] = useState('')
  const [busy, setBusy]   = useState(false)
  const [done, setDone]   = useState<string | null>(null) // "until" label ('' for an overage)

  // Card-entry mode: on from the start when there's no card on file, and
  // switched on mid-flight if the server comes back with needsCard (a card that
  // looked usable but wasn't).
  const [cardMode, setCardMode] = useState(false)
  const [sdkReady, setSdkReady] = useState(false)
  const [sdkError, setSdkError] = useState<string | null>(null)
  const cardRef = useRef<any>(null)
  const cardBox = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetch(`/api/extensions/${token}`)
      .then(r => r.json())
      .then(d => {
        if (!d.request) { setError('Request not found.'); return }
        setReq(d.request)
        if (d.request.status === 'pending' && d.request.hasCardOnFile === false) setCardMode(true)
      })
      .catch(() => setError('Could not load the request.'))
  }, [token])

  // Mount the Square card field once card mode turns on.
  useEffect(() => {
    if (!cardMode || cardRef.current) return
    let mounted = true
    loadSquareScript().then(async () => {
      if (!mounted) return
      const appId = process.env.NEXT_PUBLIC_SQUARE_APP_ID!
      const locationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID!
      if (!appId || !locationId) { setSdkError('Card payments aren’t configured — text (832) 408-1631.'); return }
      try {
        const payments = window.Square.payments(appId, locationId)
        if (cardBox.current && !cardRef.current) {
          const card = await payments.card()
          await card.attach(cardBox.current)
          cardRef.current = card
        }
        if (mounted) setSdkReady(true)
      } catch (e: any) {
        setSdkError(e?.message || 'Couldn’t load the card form.')
      }
    }).catch(e => setSdkError(e.message))
    return () => { mounted = false }
  }, [cardMode])

  const submit = useCallback(async () => {
    if (busy) return
    setBusy(true); setError('')

    let payload: any = undefined
    if (cardMode) {
      if (!cardRef.current) { setError('The card form is still loading — one moment.'); setBusy(false); return }
      try {
        const tok = await cardRef.current.tokenize()
        if (tok.status !== 'OK') {
          setError(tok.errors?.[0]?.message || 'Please check the card details.')
          setBusy(false); return
        }
        payload = { sourceId: tok.token, saveCard: true }
      } catch {
        setError('Could not read the card — try again.')
        setBusy(false); return
      }
    }

    try {
      const r = await fetch(`/api/extensions/${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload ?? {}),
      })
      const d = await r.json()
      if (r.ok && d.success) {
        setDone(d.until ?? '')
      } else if (d.needsCard) {
        // The card we thought was on file isn't usable — ask for one instead of
        // dead-ending them.
        setCardMode(true)
        setError('We couldn’t find a usable card on your account — enter one below.')
      } else {
        setError(d.error || 'Something went wrong — text (832) 408-1631.')
      }
    } catch { setError('Connection problem — try again.') }
    setBusy(false)
  }, [busy, cardMode, token])

  const wrap: React.CSSProperties = {
    background: 'radial-gradient(120% 90% at 85% -10%, #191510 0%, #0d0d10 45%, #09090b 100%)',
    minHeight: '100vh', color: '#fff', fontFamily: 'Inter, sans-serif',
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
  }

  if (error && !req) return <div style={wrap}><div style={{ color: 'rgba(255,255,255,0.6)', textAlign: 'center' }}>{error}</div></div>
  if (!req) return <div style={wrap}><div style={{ color: 'rgba(255,255,255,0.35)' }}>Loading…</div></div>

  const dead      = req.status === 'expired' || req.status === 'cancelled' || req.status === 'failed'
  const isOverage = req.kind === 'overage'
  const durLabel  = req.durationLabel || `${req.hours} hour${req.hours > 1 ? 's' : ''}`

  return (
    <div style={wrap}>
      <div style={{ maxWidth: 400, width: '100%', textAlign: 'center' }}>
        <div style={{ fontWeight: 900, letterSpacing: '0.3em', fontSize: 17, marginBottom: 6 }}>MADE KULTURE</div>
        <div style={{ fontSize: 10, color: 'rgba(201,178,126,0.55)', letterSpacing: '0.4em', marginBottom: 30 }}>
          {isOverage ? 'OVERTIME' : 'SESSION EXTENSION'}
        </div>

        {done !== null || req.status === 'confirmed' ? (
          <>
            <div style={{ fontSize: 11, letterSpacing: '0.34em', color: 'rgba(201,178,126,0.6)', marginBottom: 16 }}>
              {isOverage ? 'PAID' : 'CONFIRMED'}
            </div>
            <div style={{ fontSize: 24, fontWeight: 800, lineHeight: 1.4 }}>
              {isOverage
                ? 'Thank you — you’re all settled'
                : `${req.setName ? `${req.setName} is yours` : 'Extended'}${done ? ` until ${done}` : ''}`}
            </div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 12 }}>
              ${req.amount} charged{isOverage ? ` for ${durLabel} of overtime.` : '. Enjoy the extra time.'}
            </div>
          </>
        ) : dead ? (
          <>
            <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>
              {req.status === 'expired' ? 'This link expired' : 'This request is no longer active'}
            </div>
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7 }}>
              Text (832) 408-1631 and we’ll send a fresh one.
            </div>
          </>
        ) : (
          <>
            <div style={{
              border: '1px solid rgba(201,178,126,0.25)', borderRadius: 18, padding: '26px 22px',
              background: 'linear-gradient(150deg, rgba(255,255,255,0.05), rgba(201,178,126,0.04))', marginBottom: 22,
            }}>
              <div style={{ fontSize: 26, fontWeight: 800 }}>{isOverage ? durLabel : `+${durLabel}`}</div>
              {req.setName && (
                <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.6)', marginTop: 6 }}>
                  {req.setName}
                  {isOverage
                    ? (req.bookedEndLabel ? ` · past your ${req.bookedEndLabel} end time` : ' · overtime')
                    : (req.newEndLabel ? ` · until ${req.newEndLabel}` : '')}
                </div>
              )}
              <div style={{ fontSize: 20, color: CHAMP, fontWeight: 700, marginTop: 14 }}>${req.amount}</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', marginTop: 4 }}>
                {cardMode ? 'enter a card below' : 'charged to your card on file'}
              </div>
            </div>

            {cardMode && (
              <>
                {sdkError && <div style={{ color: '#ff8f8f', fontSize: 13, marginBottom: 12 }}>{sdkError}</div>}
                {/* Square-hosted card iframe mounts here. */}
                <div ref={cardBox} style={{
                  background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(201,178,126,0.25)',
                  borderRadius: 12, padding: 12, minHeight: 52, marginBottom: 16, textAlign: 'left',
                }} />
              </>
            )}

            {error && <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>{error}</div>}

            <button disabled={busy || (cardMode && !sdkReady)} onClick={submit} style={{
              width: '100%',
              background: busy || (cardMode && !sdkReady)
                ? 'linear-gradient(135deg, rgba(215,192,139,0.45), rgba(156,130,80,0.45))'
                : 'linear-gradient(135deg, #d7c08b, #9c8250)',
              color: INK, border: 'none', padding: '17px', borderRadius: 14, fontFamily: 'Inter, sans-serif',
              fontSize: 14, fontWeight: 800, letterSpacing: '0.14em',
              cursor: busy || (cardMode && !sdkReady) ? 'default' : 'pointer',
            }}>
              {busy ? 'PROCESSING…'
                : cardMode && !sdkReady ? 'LOADING…'
                : isOverage ? `PAY $${req.amount}` : 'CONFIRM & PAY'}
            </button>

            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 14, lineHeight: 1.6 }}>
              {cardMode
                ? 'Secured by Square. Your full card number never touches Made Kulture’s servers.'
                : 'Didn’t request this? Just close this page — nothing is charged unless you confirm.'}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
