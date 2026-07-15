'use client'

// Admin manual card charge — a small modal that mounts the Square Web Payments
// card field so staff can key a card in on the spot (phone booking, walk-in)
// and charge it, with no saved card required. Reuses the exact SDK pattern from
// the customer pay page (app/pay/[token]/page.tsx). The raw card never touches
// our server — it's tokenized client-side and only the nonce is sent.

import { useCallback, useEffect, useRef, useState } from 'react'

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

export interface AdminCardChargeProps {
  amount: number                     // dollars to charge
  title?: string                     // modal heading (default "CHARGE CARD")
  description?: string               // Square note + SMS context
  bookingId?: string                 // optional booking to update on success
  newTotal?: number                  // optional new total_amount for that booking
  customerId?: string | null         // supabase customers.id — enables "save on file"
  customerEmail?: string | null
  customerPhone?: string | null
  customerName?: string | null
  sendSmsDefault?: boolean           // default the notify-SMS checkbox
  endpoint?: string                  // where to POST the charge (default charge-manual)
  extraPayload?: Record<string, any> // extra fields merged into the POST body (e.g. add-set details)
  onSuccess: (info: { squarePaymentId: string; cardSaved: boolean }) => void
  onClose: () => void
}

export default function AdminCardCharge({
  amount, title = 'CHARGE CARD', description, bookingId, newTotal,
  customerId, customerEmail, customerPhone, customerName,
  sendSmsDefault = true, endpoint = '/api/admin/charge-manual', extraPayload,
  onSuccess, onClose,
}: AdminCardChargeProps) {
  const [sdkReady, setSdkReady] = useState(false)
  const [sdkError, setSdkError] = useState<string | null>(null)
  const [charging, setCharging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saveCard, setSaveCard] = useState(true)
  const [sendSms, setSendSms] = useState(sendSmsDefault)
  const cardRef = useRef<any>(null)
  const cardBox = useRef<HTMLDivElement>(null)

  // Mount the Square card field once.
  useEffect(() => {
    let mounted = true
    loadSquareScript().then(async () => {
      if (!mounted) return
      const appId = process.env.NEXT_PUBLIC_SQUARE_APP_ID!
      const locationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID!
      if (!appId || !locationId) { setSdkError('Payments aren’t configured (missing Square keys).'); return }
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
    return () => { mounted = false; try { cardRef.current?.destroy?.() } catch {} }
  }, [])

  const charge = useCallback(async () => {
    if (!cardRef.current || charging) return
    setCharging(true); setError(null)
    try {
      const tok = await cardRef.current.tokenize()
      if (tok.status !== 'OK') {
        setError(tok.errors?.[0]?.message || 'Please check the card details.')
        setCharging(false); return
      }
      const res = await fetch(endpoint, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId: tok.token,
          amount,
          description,
          bookingId,
          newTotal,
          customerId: customerId || undefined,
          saveCard: saveCard && !!customerId,
          email: customerEmail || undefined,
          phone: customerPhone || undefined,
          customerName: customerName || undefined,
          sendSms,
          ...(extraPayload || {}),
        }),
      })
      const d = await res.json()
      if (res.ok && d.success) {
        onSuccess({ squarePaymentId: d.squarePaymentId, cardSaved: !!d.cardSaved })
      } else {
        setError(d.error || 'Charge failed — try again.')
        setCharging(false)
      }
    } catch {
      setError('Something went wrong. Please try again.')
      setCharging(false)
    }
  }, [amount, description, bookingId, newTotal, customerId, customerEmail, customerPhone, customerName, saveCard, sendSms, charging, onSuccess, endpoint, extraPayload])

  const label: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.5)' }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget && !charging) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#111', border: '1px solid rgba(255,255,255,0.12)', width: '100%', maxWidth: 440, padding: 32, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.05em' }}>{title}</div>
          <button onClick={onClose} disabled={charging}
            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: charging ? 'default' : 'pointer', fontSize: 20 }}>
            &#x2715;
          </button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
          <span style={{ ...label }}>AMOUNT</span>
          <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 30, color: '#4ade80', letterSpacing: '0.03em' }}>${amount.toFixed(2)}</span>
        </div>
        {customerName && (
          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 14 }}>{customerName}</div>
        )}

        {sdkError && <div style={{ color: '#ff6b6b', fontSize: 13, margin: '10px 0' }}>{sdkError}</div>}

        {/* Square-hosted card iframe mounts here. */}
        <div ref={cardBox} style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.14)', borderRadius: 8, padding: 12, minHeight: 52, marginTop: 8 }} />

        {customerId && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, cursor: 'pointer' }}>
            <input type="checkbox" checked={saveCard} onChange={e => setSaveCard(e.target.checked)} />
            <span style={label}>SAVE THIS CARD ON FILE (FOR OVERAGES + EXTENSIONS)</span>
          </label>
        )}

        <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, cursor: 'pointer' }}>
          <input type="checkbox" checked={sendSms} onChange={e => setSendSms(e.target.checked)} />
          <span style={label}>TEXT THE CUSTOMER A CONFIRMATION</span>
        </label>

        {error && <div style={{ color: '#ff6b6b', fontSize: 13, marginTop: 12, lineHeight: 1.5 }}>{error}</div>}

        <button onClick={charge} disabled={!sdkReady || charging}
          style={{
            width: '100%', marginTop: 20, padding: '14px',
            background: sdkReady && !charging ? '#4ade80' : 'rgba(74,222,128,0.4)',
            border: 'none', color: '#080808', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: '0.14em',
            cursor: sdkReady && !charging ? 'pointer' : 'default',
          }}>
          {charging ? 'CHARGING…' : `CHARGE $${amount.toFixed(2)}`}
        </button>

        <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 12, lineHeight: 1.6 }}>
          Secured by Square. The full card number never touches Made Kulture’s servers.
        </div>
      </div>
    </div>
  )
}
