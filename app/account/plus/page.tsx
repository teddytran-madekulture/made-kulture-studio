'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import PlusCheckout from '@/components/PlusCheckout'

interface Status { active: boolean; expiresAt: number | null; autoRenew: boolean; comp: boolean; priceCents: number; standardCents?: number; introUntil?: string; isIntro?: boolean }

function fmtDate(ms: number) {
  return new Date(ms).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}
function fmtDay(d: string) {
  return new Date(d + 'T12:00:00').toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
}

const BENEFITS = [
  ['See the calendar inside 48 hours', 'Members can view near-term availability — the slots non-members can’t see.'],
  ['Request short-notice bookings', 'Ask to book inside the 48-hour window. The studio approves each request, then you have a short window to grab it.'],
  ['Cancellation protection', 'Life happens. Cancel a booking — even last minute — and its full value comes back as studio credit for your next session instead of being forfeited. No-shows can be credited too, with a quick heads-up to the studio.'],
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
      <Link href="/account" style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(var(--t-fg-rgb), calc(0.5 * var(--t-a)))', textDecoration: 'none' }}>← Account</Link>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 40, letterSpacing: '0.02em', margin: '10px 0 4px' }}>MADE KULTURE PLUS</h1>
      <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(var(--t-fg-rgb), calc(0.45 * var(--t-a)))', margin: '0 0 28px' }}>
        Short-notice booking access and cancellation protection for creators. <strong style={{ color: 'var(--t-gold)' }}>{priceLabel}/year.</strong>
      </p>

      {loading ? (
        <div style={{ color: 'rgba(var(--t-fg-rgb), calc(0.4 * var(--t-a)))', fontFamily: 'Inter', fontSize: 14 }}>Loading…</div>
      ) : status?.active ? (
        <div style={{ background: 'rgba(var(--t-gold-rgb), 0.08)', border: '1px solid rgba(var(--t-gold-rgb), 0.35)', borderRadius: 10, padding: '22px 24px' }}>
          <div style={{ fontFamily: 'Inter', fontSize: 15, fontWeight: 700, color: 'var(--t-gold)', marginBottom: 6 }}>✓ You’re a Plus member{status.comp ? ' (complimentary)' : ''}</div>
          <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(var(--t-fg-rgb), calc(0.55 * var(--t-a)))', lineHeight: 1.6 }}>
            {status.expiresAt ? <>Your membership {status.comp ? 'runs through' : (status.autoRenew ? 'renews on' : 'expires on')} <strong style={{ color: 'var(--t-fg)' }}>{fmtDate(status.expiresAt)}</strong>.</> : 'Your membership is active.'}
            {' '}You can see the 48-hour window on <Link href="/availability" style={{ color: 'var(--t-gold)' }}>availability</Link> and request short-notice bookings. Manage auto-renew from your <Link href="/account" style={{ color: 'var(--t-gold)' }}>account</Link>.
          </div>
        </div>
      ) : (
        <>
          {status?.isIntro && status.standardCents && status.introUntil && (
            <div style={{ background: 'linear-gradient(135deg, rgba(var(--t-gold-rgb), 0.18), rgba(var(--t-gold-rgb), 0.04))', border: '1px solid rgba(var(--t-gold-rgb), 0.45)', borderRadius: 8, padding: '14px 18px', marginBottom: 24 }}>
              <span style={{ fontFamily: 'Inter', fontSize: 13, color: 'var(--t-gold)', fontWeight: 600 }}>Act now — intro price.</span>
              <span style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(var(--t-fg-rgb), calc(0.65 * var(--t-a)))' }}> {priceLabel}/year is the founding rate through {fmtDay(status.introUntil)}. It goes up to ${(status.standardCents / 100).toFixed(0)}/year after that, so join now to lock in your first year at {priceLabel}.</span>
            </div>
          )}
          <div className="plus-grid">
          <div style={{ display: 'grid', gap: 12 }}>
            {BENEFITS.map(([title, desc]) => (
              <div key={title} style={{ background: 'var(--t-surface)', border: '1px solid rgba(var(--t-fg-rgb), calc(0.08 * var(--t-a)))', borderRadius: 8, padding: '16px 20px' }}>
                <div style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 600, color: 'var(--t-fg)', marginBottom: 3 }}>{title}</div>
                <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(var(--t-fg-rgb), calc(0.45 * var(--t-a)))', lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
          <div className="plus-grid-pay">
            <PlusCheckout priceLabel={priceLabel} onSuccess={load} />
          </div>
          </div>
        </>
      )}
    </div>
  )
}
