'use client'
// The Plus card form + charge. Extracted 2026-09-27 from app/account/plus/page.tsx
// so the "save this booking with Plus" offer on /account/bookings can sell Plus
// in place, through the SAME route (/api/account/plus, action 'checkout') — no
// second payment path. The server re-reads the price; priceLabel is display only.
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

export default function PlusCheckout({ priceLabel, onSuccess }: { priceLabel: string; onSuccess: () => void }) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [card, setCard] = useState<unknown>(null)
  const [paying, setPaying] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (typeof window === 'undefined') return
    let cancelled = false
    const appId = process.env.NEXT_PUBLIC_SQUARE_APP_ID
    const locId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID
    if (!appId || !locId) { setError('Payment isn’t configured. Contact the studio.'); return }
    const src = appId.startsWith('sandbox-')
      ? 'https://sandbox.web.squarecdn.com/v1/square.js'
      : 'https://web.squarecdn.com/v1/square.js'

    const init = async () => {
      try {
        const payments = (window as any).Square.payments(appId, locId)
        const c = await payments.card()
        if (cancelled || !containerRef.current) return
        containerRef.current.innerHTML = ''
        await c.attach(containerRef.current)
        if (cancelled) return
        setCard(c)
      } catch {
        if (!cancelled) setError('Could not load the card form. Please refresh and try again.')
      }
    }

    if ((window as any).Square) { init() }
    else {
      let script = document.getElementById('square-sdk') as HTMLScriptElement | null
      if (!script) {
        script = document.createElement('script')
        script.id = 'square-sdk'; script.src = src
        document.head.appendChild(script)
      }
      script.addEventListener('load', init)
    }
    return () => { cancelled = true }
  }, [])

  const pay = async () => {
    if (!card) return
    setPaying(true); setError('')
    try {
      const result = await (card as any).tokenize()
      if (result.status !== 'OK') throw new Error(result.errors?.[0]?.message ?? 'Card error')
      const res = await fetch('/api/account/plus', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'checkout', sourceId: result.token }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error ?? 'Payment failed.')
      onSuccess()
    } catch (e: any) {
      setError(e.message); setPaying(false)
    }
  }

  return (
    <div style={{ background: 'var(--t-surface)', border: '1px solid rgba(var(--t-fg-rgb), calc(0.1 * var(--t-a)))', borderRadius: 10, padding: 24 }}>
      <div style={{ fontFamily: 'Inter', fontSize: 13, letterSpacing: '0.06em', color: 'rgba(var(--t-fg-rgb), calc(0.4 * var(--t-a)))', marginBottom: 16 }}>PAY {priceLabel} · 1 YEAR</div>
      {error && (
        <div style={{ background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.2)', borderRadius: 4, padding: '10px 14px', fontFamily: 'Inter', fontSize: 13, color: 'var(--t-err)', marginBottom: 16 }}>{error}</div>
      )}
      <div ref={containerRef} style={{ minHeight: 60, marginBottom: 16 }} />
      <button onClick={pay} disabled={paying || !card} style={{ background: 'var(--t-gold)', color: 'var(--t-on-fg)', border: 'none', borderRadius: 4, padding: '13px 26px', fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', cursor: paying || !card ? 'default' : 'pointer', opacity: paying || !card ? 0.6 : 1 }}>
        {paying ? 'PROCESSING…' : `GO PLUS · ${priceLabel}`}
      </button>
      <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(var(--t-fg-rgb), calc(0.3 * var(--t-a)))', marginTop: 14, lineHeight: 1.5 }}>
        Your card is saved and your membership renews automatically each year at the then-current price. Cancel auto-renew anytime from your account — your benefits continue through the end of your paid year. Membership fees are non-refundable. See <Link href="/terms" style={{ color: 'rgba(var(--t-fg-rgb), calc(0.5 * var(--t-a)))', textDecoration: 'underline' }}>terms</Link>.
      </div>
    </div>
  )
}
