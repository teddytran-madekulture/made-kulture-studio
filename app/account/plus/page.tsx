'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'

interface Status { active: boolean; expiresAt: number | null; autoRenew: boolean; comp: boolean; priceCents: number }

function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

const BENEFITS = [
  ['See the calendar inside 48 hours', 'Members can view near-term availability — the slots non-members can’t see.'],
  ['Request short-notice bookings', 'Ask to book inside the 48-hour window. The studio approves each request, then you have a short window to grab it.'],
]

export default function PlusPage() {
  const [status, setStatus] = useState<Status | null>(null)
  const [loading, setLoading] = useState(true)

  const load = () => {
    setLoading(true)
    fetch('/api/account/plus').then(r => r.ok ? r.json() : null)
      .then(d => { setStatus(d); setLoading(false) })
      .catch(() => setLoading(false))
  }
  useEffect(() => { load() }, [])

  const priceLabel = status ? `$${(status.priceCents / 100).toFixed(0)}` : '—'

  return (
    <div>
      <Link href="/account" style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>← Account</Link>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 40, letterSpacing: '0.02em', margin: '10px 0 4px' }}>MADE KULTURE PLUS</h1>
      <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: '0 0 28px' }}>
        Membership for creators who book on short notice. <strong style={{ color: '#e6c07a' }}>{priceLabel}/year.</strong>
      </p>

      {loading ? (
        <div style={{ color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter', fontSize: 14 }}>Loading…</div>
      ) : status?.active ? (
        <div style={{ background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.35)', borderRadius: 10, padding: '22px 24px' }}>
          <div style={{ fontFamily: 'Inter', fontSize: 15, fontWeight: 700, color: '#e6c07a', marginBottom: 6 }}>✓ You’re a Plus member{status.comp ? ' (complimentary)' : ''}</div>
          <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
            {status.expiresAt ? <>Your membership {status.comp ? 'runs through' : (status.autoRenew ? 'renews on' : 'expires on')} <strong style={{ color: '#fff' }}>{fmtDate(status.expiresAt)}</strong>.</> : 'Your membership is active.'}
            {' '}You can see the 48-hour window on <Link href="/availability" style={{ color: '#e6c07a' }}>availability</Link> and request short-notice bookings. Manage auto-renew from your <Link href="/account" style={{ color: '#e6c07a' }}>account</Link>.
          </div>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gap: 12, marginBottom: 28 }}>
            {BENEFITS.map(([title, desc]) => (
              <div key={title} style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '16px 20px' }}>
                <div style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 3 }}>{title}</div>
                <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
          <Checkout priceLabel={priceLabel} onSuccess={load} />
        </>
      )}
    </div>
  )
}

function Checkout({ priceLabel, onSuccess }: { priceLabel: string; onSuccess: () => void }) {
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
    <div style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 10, padding: 24 }}>
      <div style={{ fontFamily: 'Inter', fontSize: 13, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.4)', marginBottom: 16 }}>PAY {priceLabel} · 1 YEAR</div>
      {error && (
        <div style={{ background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.2)', borderRadius: 4, padding: '10px 14px', fontFamily: 'Inter', fontSize: 13, color: '#ff6b6b', marginBottom: 16 }}>{error}</div>
      )}
      <div ref={containerRef} style={{ minHeight: 60, marginBottom: 16 }} />
      <button onClick={pay} disabled={paying || !card} style={{ background: '#d4a843', color: '#080808', border: 'none', borderRadius: 4, padding: '13px 26px', fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', cursor: paying || !card ? 'default' : 'pointer', opacity: paying || !card ? 0.6 : 1 }}>
        {paying ? 'PROCESSING…' : `GO PLUS · ${priceLabel}`}
      </button>
      <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 14, lineHeight: 1.5 }}>
        Your card is saved and your membership renews automatically each year for {priceLabel}. You can turn off auto-renew anytime from your account.
      </div>
    </div>
  )
}
