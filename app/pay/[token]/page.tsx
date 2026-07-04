'use client'

// Delegated payment — the public "someone else pays" page.
// House style = the luxury charcoal/champagne language used on /kiosk and June.

import { useCallback, useEffect, useRef, useState } from 'react'

const CHAMP = '#c9b27e'
const CHAMP_DIM = 'rgba(201,178,126,0.55)'
const HAIR = 'rgba(201,178,126,0.22)'
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

interface Line { setName: string; start: string; end: string; status: string }
interface Req {
  status: 'pending' | 'paid' | 'expired' | 'cancelled' | 'failed'
  amount: string
  expiresAt: string
  payerName: string | null
  bookerName: string | null
  lines: Line[]
}

export default function PayPage({ params }: { params: { token: string } }) {
  const [req, setReq] = useState<Req | null>(null)
  const [loadErr, setLoadErr] = useState<string | null>(null)
  const [remaining, setRemaining] = useState<number>(0) // seconds
  const [sdkReady, setSdkReady] = useState(false)
  const [sdkError, setSdkError] = useState<string | null>(null)
  const [paying, setPaying] = useState(false)
  const [payError, setPayError] = useState<string | null>(null)
  const [done, setDone] = useState(false)
  const [gpayReady, setGpayReady] = useState(false)
  const cardRef = useRef<any>(null)
  const cardBox = useRef<HTMLDivElement>(null)

  // Fetch the request.
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/pay/${params.token}`)
      if (r.status === 404) { setLoadErr('This payment link isn’t valid.'); return }
      const d = await r.json()
      if (d.error) { setLoadErr('This payment link isn’t valid.'); return }
      setReq(d.request)
    } catch {
      setLoadErr('Couldn’t load this payment link — check your connection.')
    }
  }, [params.token])

  useEffect(() => { load() }, [load])

  // Countdown from expiresAt.
  useEffect(() => {
    if (!req?.expiresAt) return
    const tick = () => {
      const secs = Math.max(0, Math.floor((Date.parse(req.expiresAt) - Date.now()) / 1000))
      setRemaining(secs)
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [req?.expiresAt])

  const isPending = req?.status === 'pending' && remaining > 0 && !done
  const showExpired = req && (req.status === 'expired' || (req.status === 'pending' && remaining <= 0)) && !done
  const showPaid = done || req?.status === 'paid'

  // Shared: send a Square token (card OR Google/Apple Pay) to the pay endpoint.
  const submitToken = async (token: string) => {
    setPaying(true); setPayError(null)
    try {
      const r = await fetch(`/api/pay/${params.token}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sourceId: token }),
      })
      const d = await r.json()
      if (r.ok && d.success) { setDone(true) }
      else { setPayError(d.error || 'Payment failed — try again.'); setPaying(false) }
    } catch {
      setPayError('Something went wrong. Please try again.')
      setPaying(false)
    }
  }

  // Mount the Square card form + Google Pay (and Apple Pay once the domain is
  // registered) once we know it's payable.
  useEffect(() => {
    if (!isPending || !req) return
    let mounted = true
    loadSquareScript().then(async () => {
      if (!mounted) return
      const appId = process.env.NEXT_PUBLIC_SQUARE_APP_ID!
      const locationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID!
      if (!appId || !locationId) { setSdkError('Payments aren’t configured.'); return }
      try {
        const payments = window.Square.payments(appId, locationId)

        // Card
        if (cardBox.current && !cardRef.current) {
          const card = await payments.card()
          await card.attach(cardBox.current)
          cardRef.current = card
        }
        if (mounted) setSdkReady(true)

        // Digital wallets — one paymentRequest drives both Google Pay and Apple Pay.
        const paymentRequest = payments.paymentRequest({
          countryCode: 'US', currencyCode: 'USD',
          total: { amount: req.amount, label: 'Made Kulture' },
        })

        // Google Pay (silently skipped where unsupported).
        try {
          const googlePay = await payments.googlePay(paymentRequest)
          await googlePay.attach('#pay-google')
          if (mounted) setGpayReady(true)
          googlePay.addEventListener('ontokenization', (event: any) => {
            const { tokenResult } = event.detail
            if (tokenResult.status === 'OK') submitToken(tokenResult.token)
            else setPayError(tokenResult.errors?.[0]?.message || 'Google Pay failed.')
          })
        } catch { /* Google Pay unavailable on this device/browser */ }

        // Apple Pay — only appears in Safari once the domain is registered with
        // Square (madekulture.com). Fails gracefully (button stays hidden) until then.
        try {
          const applePay = await payments.applePay(paymentRequest)
          const btn = document.getElementById('pay-apple')
          if (btn) {
            btn.style.display = 'block'
            btn.addEventListener('click', async () => {
              try {
                const tok = await applePay.tokenize()
                if (tok.status === 'OK') submitToken(tok.token)
                else setPayError(tok.errors?.[0]?.message || 'Apple Pay failed.')
              } catch { setPayError('Apple Pay failed — try a card.') }
            })
          }
        } catch { /* Apple Pay unavailable / domain not yet registered */ }
      } catch (e: any) {
        setSdkError(e?.message || 'Couldn’t load the card form.')
      }
    }).catch(e => setSdkError(e.message))
    return () => { mounted = false }
  }, [isPending, req])

  const pay = async () => {
    if (!cardRef.current || paying) return
    setPaying(true); setPayError(null)
    try {
      const tok = await cardRef.current.tokenize()
      if (tok.status !== 'OK') {
        setPayError(tok.errors?.[0]?.message || 'Please check your card details.')
        setPaying(false); return
      }
      await submitToken(tok.token)
    } catch {
      setPayError('Something went wrong. Please try again.')
      setPaying(false)
    }
  }

  const mmss = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`
  const low = remaining <= 300 // last 5 min

  const wrap: React.CSSProperties = {
    minHeight: '100vh',
    background: 'radial-gradient(120% 90% at 85% -10%, #191510 0%, #0d0d10 45%, #09090b 100%)',
    color: '#fff', fontFamily: 'Inter, system-ui, sans-serif',
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '40px 18px', boxSizing: 'border-box',
  }
  const card: React.CSSProperties = {
    width: '100%', maxWidth: 440,
    background: 'linear-gradient(150deg, rgba(255,255,255,0.055) 0%, rgba(255,255,255,0.015) 60%, rgba(201,178,126,0.05) 100%)',
    border: `1px solid ${HAIR}`, borderRadius: 22, padding: 28,
    boxShadow: '0 18px 40px rgba(0,0,0,0.45)', boxSizing: 'border-box',
  }
  const champBtn: React.CSSProperties = {
    background: `linear-gradient(135deg, #d7c08b 0%, #b59a63 55%, #9c8250 100%)`,
    color: INK, border: 'none', width: '100%', padding: '16px', borderRadius: 14,
    fontFamily: 'Inter, sans-serif', fontSize: 13, fontWeight: 800, letterSpacing: '0.16em',
    cursor: 'pointer', marginTop: 18,
  }

  const header = (
    <div style={{ textAlign: 'center', marginBottom: 22 }}>
      <div style={{ fontWeight: 900, letterSpacing: '0.3em', fontSize: 18 }}>MADE KULTURE</div>
      <div style={{ fontSize: 10, color: CHAMP_DIM, letterSpacing: '0.42em', marginTop: 6 }}>SECURE PAYMENT</div>
    </div>
  )

  if (loadErr) return (
    <main style={wrap}>{header}
      <div style={card}>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>Link unavailable</div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>{loadErr}</div>
      </div>
    </main>
  )

  if (!req) return (
    <main style={wrap}>{header}
      <div style={{ ...card, textAlign: 'center', color: CHAMP_DIM, letterSpacing: '0.18em', fontSize: 12 }}>LOADING…</div>
    </main>
  )

  if (showPaid) return (
    <main style={wrap}>{header}
      <div style={{ ...card, textAlign: 'center' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.34em', color: CHAMP_DIM, marginBottom: 14 }}>PAYMENT RECEIVED</div>
        <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 12 }}>All set{req.bookerName ? `, ${req.bookerName}’s booked` : ''}</div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }}>
          Your ${req.amount} payment is confirmed. {req.bookerName || 'The booker'} has the booking details and door code — nothing else needed from you.
        </div>
      </div>
    </main>
  )

  if (showExpired) return (
    <main style={wrap}>{header}
      <div style={{ ...card, textAlign: 'center' }}>
        <div style={{ fontSize: 11, letterSpacing: '0.34em', color: CHAMP_DIM, marginBottom: 14 }}>LINK EXPIRED</div>
        <div style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>This hold timed out</div>
        <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)', lineHeight: 1.7 }}>
          The slot was only held for a short window and it’s now been released. Ask {req.bookerName || 'whoever sent this'} to start the booking again and resend a fresh link.
        </div>
      </div>
    </main>
  )

  // Pending — payable.
  return (
    <main style={wrap}>{header}
      <div style={card}>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.6, marginBottom: 6 }}>
          {req.bookerName ? `${req.bookerName} asked you to cover this booking` : 'You’ve been asked to cover this booking'}
        </div>

        <div style={{ borderTop: `1px solid ${HAIR}`, borderBottom: `1px solid ${HAIR}`, padding: '14px 0', margin: '12px 0' }}>
          {req.lines.map((l, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 14, padding: '4px 0' }}>
              <span style={{ fontWeight: 600 }}>{l.setName}</span>
              <span style={{ color: 'rgba(255,255,255,0.6)' }}>{l.start}–{l.end}</span>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <span style={{ fontSize: 12, letterSpacing: '0.2em', color: CHAMP_DIM }}>TOTAL</span>
          <span style={{ fontSize: 30, fontWeight: 800, color: CHAMP }}>${req.amount}</span>
        </div>

        <div style={{ textAlign: 'center', margin: '14px 0 6px' }}>
          <span style={{ fontSize: 12, color: low ? '#e6b8a0' : 'rgba(255,255,255,0.45)', letterSpacing: '0.1em' }}>
            Slot held — {mmss} left to pay
          </span>
        </div>

        {/* Digital wallets — Google Pay shows where supported; Apple Pay appears in
            Safari once madekulture.com is registered with Square (stays hidden until then). */}
        <div id="pay-apple" style={{ display: 'none', marginTop: 14, height: 48, WebkitAppearance: '-apple-pay-button', borderRadius: 10, overflow: 'hidden', cursor: 'pointer' } as any} />
        <div id="pay-google" style={{ marginTop: 14 }} />
        {gpayReady && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '14px 0 2px' }}>
            <div style={{ flex: 1, height: 1, background: HAIR }} />
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.12em' }}>OR PAY WITH CARD</span>
            <div style={{ flex: 1, height: 1, background: HAIR }} />
          </div>
        )}

        {sdkError && <div style={{ color: '#e6b8a0', fontSize: 13, margin: '10px 0' }}>{sdkError}</div>}
        <div ref={cardBox} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 12, padding: 12, minHeight: 52, marginTop: 8 }} />
        {payError && <div style={{ color: '#e6b8a0', fontSize: 13, marginTop: 10, lineHeight: 1.5 }}>{payError}</div>}

        <button style={{ ...champBtn, opacity: sdkReady && !paying ? 1 : 0.55, cursor: sdkReady && !paying ? 'pointer' : 'default' }}
          onClick={pay} disabled={!sdkReady || paying}>
          {paying ? 'PROCESSING…' : `PAY $${req.amount}`}
        </button>

        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.32)', textAlign: 'center', marginTop: 14, lineHeight: 1.6 }}>
          Secured by Square. Made Kulture never sees your card number.
        </div>
      </div>
    </main>
  )
}
