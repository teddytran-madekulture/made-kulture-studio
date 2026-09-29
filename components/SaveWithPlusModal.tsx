'use client'
// "Save this booking with Plus" — built 2026-09-27.
//
// A non-member inside 48 hours used to hit a dead end ("text the studio") and
// forfeit the booking. Plus already lets a member cancel for full credit, or
// move the session, right up to the start. So this is NOT a new capability —
// it is Plus sold at the moment it is worth the most, through the SAME checkout
// route as /account/plus.
//
// ⚠️ Joining does NOT touch the booking. It only unlocks the buttons the
// member would have had anyway; the customer then picks RESCHEDULE or CANCEL.
// Doing the cancel automatically would take a decision away from them — some
// will join and then decide to keep the session.
//
// ⚠️ Same price as everywhere else, deliberately. A cheaper "rescue" price would
// teach people to skip Plus until they are in trouble (Teddy's call, 2026-09-27).
//
// ⚠️ Never offered for a full-warehouse booking: Plus does not waive the 25%
// late fee and buyouts cannot be self-rescheduled, so it would sell nothing.
import { useEffect, useState } from 'react'
import PlusCheckout from '@/components/PlusCheckout'

const GOLD = 'var(--t-gold)'

export default function SaveWithPlusModal({
  booking, onClose, onDone,
}: {
  booking: { setName: string; when: string; totalDollars: number | null; canMove: boolean }
  onClose: () => void
  onDone: () => void
}) {
  const [priceLabel, setPriceLabel] = useState('—')

  useEffect(() => {
    fetch('/api/account/plus').then(r => (r.ok ? r.json() : null))
      .then(d => { if (d?.priceCents) setPriceLabel(`$${(d.priceCents / 100).toFixed(0)}`) })
      .catch(() => {})
  }, [])

  const value = booking.totalDollars != null && booking.totalDollars > 0
    ? `$${booking.totalDollars.toFixed(2)}` : 'its full value'

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, overflowY: 'auto' }}
    >
      <div style={{ width: '100%', maxWidth: 480, background: '#101010', border: '1px solid rgba(var(--t-gold-rgb), 0.35)', borderRadius: 12, padding: 24, maxHeight: 'calc(92 * var(--svh, 1vh))', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 26, letterSpacing: '0.02em', color: GOLD }}>
            SAVE THIS BOOKING WITH PLUS
          </div>
          <button onClick={onClose} aria-label="Close" style={{ background: 'none', border: 'none', color: 'rgba(var(--t-fg-rgb), 0.5)', fontSize: 22, cursor: 'pointer', lineHeight: 1 }}>×</button>
        </div>

        <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(var(--t-fg-rgb), 0.55)', margin: '8px 0 18px' }}>
          {booking.setName} · {booking.when}
        </div>

        <p style={{ fontFamily: 'Inter', fontSize: 14, lineHeight: 1.6, color: 'rgba(var(--t-fg-rgb), 0.8)', margin: '0 0 12px' }}>
          You’re inside 48 hours, so this booking can’t be changed or cancelled on a standard account.
          Plus members can, right up until the session starts.
        </p>
        <ul style={{ fontFamily: 'Inter', fontSize: 13, lineHeight: 1.7, color: 'rgba(var(--t-fg-rgb), 0.7)', margin: '0 0 12px', paddingLeft: 18 }}>
          {booking.canMove && <li>Move it to another time — same set, same length, no extra charge.</li>}
          <li>Or cancel it and get {value} back as studio credit. Cancellation credit never expires.</li>
          <li>Plus stays active for a year: short-notice booking and cancellation protection on every booking.</li>
        </ul>
        <p style={{ fontFamily: 'Inter', fontSize: 12, lineHeight: 1.6, color: 'rgba(var(--t-fg-rgb), 0.45)', margin: '0 0 18px' }}>
          Joining doesn’t change your booking by itself. Once you’re in, you choose what to do with it — before the session starts.
        </p>

        <PlusCheckout priceLabel={priceLabel} onSuccess={onDone} />
      </div>
    </div>
  )
}
