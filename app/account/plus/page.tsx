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
      <Link href="/account" style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.5)', textDecoration: 'none' }}>← Account</Link>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 40, letterSpacing: '0.02em', margin: '10px 0 4px' }}>MADE KULTURE PLUS</h1>
      <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: '0 0 28px' }}>
        Short-notice booking access and cancellation protection for creators. <strong style={{ color: '#e6c07a' }}>{priceLabel}/year.</strong>
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
          {status?.isIntro && status.standardCents && status.introUntil && (
            <div style={{ background: 'linear-gradient(135deg, rgba(212,168,67,0.18), rgba(212,168,67,0.04))', border: '1px solid rgba(212,168,67,0.45)', borderRadius: 8, padding: '14px 18px', marginBottom: 24 }}>
              <span style={{ fontFamily: 'Inter', fontSize: 13, color: '#e6c07a', fontWeight: 600 }}>Act now — intro price.</span>
              <span style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.65)' }}> {priceLabel}/year is the founding rate through {fmtDay(status.introUntil)}. It goes up to ${(status.standardCents / 100).toFixed(0)}/year after that, so join now to lock in your first year at {priceLabel}.</span>
            </div>
          )}
          <div style={{ display: 'grid', gap: 12, marginBottom: 28 }}>
            {BENEFITS.map(([title, desc]) => (
              <div key={title} style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '16px 20px' }}>
                <div style={{ fontFamily: 'Inter', fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 3 }}>{title}</div>
                <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.5 }}>{desc}</div>
              </div>
            ))}
          </div>
          <PlusCheckout priceLabel={priceLabel} onSuccess={load} />
        </>
      )}
    </div>
  )
}
