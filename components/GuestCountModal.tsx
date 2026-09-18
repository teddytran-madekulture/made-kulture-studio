'use client'

// Admin "Party size" — change the guest count on an existing booking and move
// the money that change is worth.
//
// ⚠️ THE BROWSER NEVER DOES THE ARITHMETIC. Every number on this screen comes
// from GET /api/admin/bookings/<id>/guests?guests=N, which is the same code path
// the POST prices against. Recomputing the fee here would make a fifth copy of a
// rate table that has already caused one undercharge (see lib/guest-rate.ts) and
// would let the screen and the charge disagree.

import { useCallback, useEffect, useState } from 'react'
import AdminCardCharge from '@/components/AdminCardCharge'

export interface GuestCountBooking {
  id: string
  guest_count: number | null
  customer_id: string | null
  start_time: string
  sets?: { name?: string } | null
  customers: { name?: string; email?: string; phone?: string } | null
}

interface SavedCard {
  id: string
  brand: string | null
  last4: string | null
  squareCustomerId: string
  isBookingCard?: boolean
  alert?: { type: string; at: string } | null
}

interface Quote {
  current: number
  proposed: number
  isBuyout: boolean
  hours: number
  capacity: number
  maxPerSet: number
  perPersonFee: number
  oldFee: number
  newFee: number
  delta: number
  storedFee: number
  storedMismatch: boolean
  total: number
  canRefund: boolean
  canCredit: boolean
  refundCeiling: number
  error?: string
  setName?: string | null
}

const label: React.CSSProperties = {
  fontFamily: 'Inter, sans-serif', fontSize: 10, letterSpacing: '0.18em',
  color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase',
}
const btn = (tone: 'gold' | 'red' | 'green' | 'plain'): React.CSSProperties => ({
  padding: '13px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11,
  letterSpacing: '0.15em', fontWeight: 600, width: '100%',
  background: tone === 'gold' ? 'rgba(212,168,67,0.14)' : tone === 'red' ? 'rgba(255,107,107,0.12)'
            : tone === 'green' ? 'rgba(74,222,128,0.12)' : 'transparent',
  border: `1px solid ${tone === 'gold' ? 'rgba(212,168,67,0.4)' : tone === 'red' ? 'rgba(255,107,107,0.4)'
            : tone === 'green' ? 'rgba(74,222,128,0.35)' : 'rgba(255,255,255,0.2)'}`,
  color: tone === 'gold' ? '#e6c07a' : tone === 'red' ? '#ff9b9b' : tone === 'green' ? '#4ade80' : '#fff',
})

export default function GuestCountModal({
  booking, onClose, onSuccess,
}: { booking: GuestCountBooking; onClose: () => void; onSuccess: () => void }) {
  const [guests, setGuests]   = useState<number>(Math.max(1, booking.guest_count ?? 1))
  const [q, setQ]             = useState<Quote | null>(null)
  const [cards, setCards]     = useState<SavedCard[]>([])
  const [card, setCard]       = useState<SavedCard | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]       = useState<string | null>(null)
  const [error, setError]     = useState<string | null>(null)
  const [done, setDone]       = useState<string | null>(null)
  const [warning, setWarning] = useState<string | null>(null)
  const [notify, setNotify]   = useState(true)
  const [keying, setKeying]   = useState(false)
  const [reason, setReason]   = useState('')

  const fetchQuote = useCallback(async (n: number) => {
    try {
      const r = await fetch(`/api/admin/bookings/${booking.id}/guests?guests=${n}`)
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'Could not price that.'); return }
      setQ(d)
    } catch { setError('Could not reach the server.') }
  }, [booking.id])

  useEffect(() => { fetchQuote(guests).finally(() => setLoading(false)) }, [guests, fetchQuote])

  useEffect(() => {
    fetch(`/api/admin/booking-cards?bookingId=${booking.id}`)
      .then(r => r.json())
      .then(d => { const list = (d.cards || []) as SavedCard[]; setCards(list); setCard(list[0] ?? null) })
      .catch(() => { /* keyed entry still works */ })
  }, [booking.id])

  const apply = async (mode: 'refund' | 'credit' | 'charge' | 'none') => {
    if (!q || busy) return
    setBusy(mode); setError(null)
    try {
      const r = await fetch(`/api/admin/bookings/${booking.id}/guests`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guests, mode, notify, reason: reason.trim() || undefined,
          ...(mode === 'charge' && card ? { squareCardId: card.id, squareCustomerId: card.squareCustomerId } : {}),
        }),
      })
      const d = await r.json()
      if (!r.ok) { setError(d.error || 'That did not go through.'); return }
      setWarning(d.warning || d.smsError || null)
      setDone(
        d.mode === 'refund' ? `Party size is now ${d.guests} and $${Math.abs(d.delta).toFixed(2)} was refunded.`
        : d.mode === 'credit' ? `Party size is now ${d.guests} and $${Math.abs(d.delta).toFixed(2)} went on as studio credit.`
        : d.mode === 'charge' ? `Party size is now ${d.guests} and the card was charged $${Math.abs(d.delta).toFixed(2)}.`
        : `Party size is now ${d.guests}. No price change.`
      )
      onSuccess()
    } finally { setBusy(null) }
  }

  const down = !!q && q.delta < 0
  const up   = !!q && q.delta > 0
  const owed = q ? Math.abs(q.delta) : 0

  // Keyed-card path for an increase — same component the other admin charges use.
  if (keying && q) {
    return (
      <AdminCardCharge
        amount={owed}
        title="KEY IN A CARD"
        description={`Made Kulture — extra guests (${q.current} → ${q.proposed})`}
        bookingId={booking.id}
        customerId={booking.customer_id}
        customerEmail={booking.customers?.email}
        customerPhone={booking.customers?.phone}
        customerName={booking.customers?.name}
        sendSmsDefault={notify}
        endpoint={`/api/admin/bookings/${booking.id}/guests`}
        extraPayload={{ guests, mode: 'charge' }}
        onClose={() => setKeying(false)}
        onSuccess={() => { onSuccess(); onClose() }}
      />
    )
  }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: '#111', border: '1px solid rgba(255,255,255,0.12)', width: '100%', maxWidth: 440, maxHeight: '90vh', overflowY: 'auto', padding: 28 }}>
        <div style={{ ...label, marginBottom: 4 }}>Party size</div>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 16, color: '#fff', marginBottom: 22 }}>
          {booking.customers?.name || 'Booking'}
          <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>
            {' · '}{q?.setName || booking.sets?.name || 'Full studio'}
          </span>
        </div>

        {loading && <div style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Pricing…</div>}

        {q && !done && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 18 }}>
              <button onClick={() => setGuests(g => Math.max(1, g - 1))} disabled={!!busy}
                style={{ ...btn('plain'), width: 44, fontSize: 18, padding: '8px 0' }}>−</button>
              <div style={{ flex: 1, textAlign: 'center' }}>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 34, color: '#fff', lineHeight: 1 }}>{guests}</div>
                <div style={{ ...label, marginTop: 6 }}>was {q.current}</div>
              </div>
              <button onClick={() => setGuests(g => g + 1)} disabled={!!busy}
                style={{ ...btn('plain'), width: 44, fontSize: 18, padding: '8px 0' }}>+</button>
            </div>

            {q.error && (
              <div style={{ fontSize: 12, lineHeight: 1.6, color: '#ff9b9b', marginBottom: 16 }}>{q.error}</div>
            )}

            {/* The whole point of the panel: show WHY the number is what it is.
                A bare "−$40.00" is the thing nobody can check later. */}
            <div style={{ border: '1px solid rgba(255,255,255,0.1)', padding: 14, marginBottom: 16, fontSize: 12, lineHeight: 1.9, color: 'rgba(255,255,255,0.7)' }}>
              {q.isBuyout ? (
                <div>A full buyout has no per-person fee — up to 30 people are included.</div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{q.current} guests · {Math.max(0, q.current - q.capacity)} over {q.capacity} × ${q.perPersonFee} × {q.hours}hr</span>
                    <span style={{ color: '#fff' }}>${q.oldFee.toFixed(2)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{q.proposed} guests · {Math.max(0, q.proposed - q.capacity)} over {q.capacity} × ${q.perPersonFee} × {q.hours}hr</span>
                    <span style={{ color: '#fff' }}>${q.newFee.toFixed(2)}</span>
                  </div>
                </>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.1)', marginTop: 8, paddingTop: 8 }}>
                <span style={{ color: '#fff' }}>{down ? 'Back to them' : up ? 'They owe' : 'Difference'}</span>
                <span style={{ color: down ? '#ff9b9b' : up ? '#4ade80' : 'rgba(255,255,255,0.4)', fontWeight: 600 }}>
                  {q.delta === 0 ? 'No change' : `${down ? '−' : '+'}$${owed.toFixed(2)}`}
                </span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', color: 'rgba(255,255,255,0.4)' }}>
                <span>Booking total ${q.total.toFixed(2)} →</span>
                <span>${Math.max(0, q.total + q.delta).toFixed(2)}</span>
              </div>
            </div>

            {/* A stored fee its own row can't reproduce = the fee was banked
                across several windows at checkout. The difference above is still
                right; the row's fee field is what changes meaning. */}
            {q.storedMismatch && (
              <div style={{ fontSize: 11, lineHeight: 1.7, color: '#fbbf24', marginBottom: 16 }}>
                Heads up — this row stores a ${q.storedFee.toFixed(2)} guest fee but its own hours price to ${q.oldFee.toFixed(2)}.
                That usually means the booking spans more than one window and the whole fee sits on this row. The difference above is
                still correct for this row; check the others before you send anything.
              </div>
            )}

            {q.delta !== 0 && (
              <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (optional — shows on the Square refund)"
                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)', color: '#fff', padding: '10px 12px', fontSize: 12, fontFamily: 'Inter, sans-serif', marginBottom: 14 }} />
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 12, color: 'rgba(255,255,255,0.65)', marginBottom: 18, cursor: 'pointer' }}>
              <input type="checkbox" checked={notify} onChange={e => setNotify(e.target.checked)} />
              Text and email them about the change
            </label>

            {error && <div style={{ fontSize: 12, lineHeight: 1.6, color: '#ff9b9b', marginBottom: 14 }}>{error}</div>}

            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              {down && (
                <>
                  <button onClick={() => apply('refund')} disabled={!!busy || !q.canRefund || !!q.error} style={{ ...btn('red'), opacity: q.canRefund && !q.error ? 1 : 0.4 }}>
                    {busy === 'refund' ? 'REFUNDING…' : `REFUND $${owed.toFixed(2)} TO THEIR CARD`}
                  </button>
                  {!q.canRefund && (
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                      No Square payment on this booking, so it can’t be refunded from here — use credit, or refund in Square directly.
                    </div>
                  )}
                  <button onClick={() => apply('credit')} disabled={!!busy || !q.canCredit || !!q.error} style={{ ...btn('gold'), opacity: q.canCredit && !q.error ? 1 : 0.4 }}>
                    {busy === 'credit' ? 'ADDING…' : `ADD $${owed.toFixed(2)} AS STUDIO CREDIT`}
                  </button>
                  {!q.canCredit && (
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                      This booking has no account attached, so credit has nowhere to live.
                    </div>
                  )}
                </>
              )}

              {up && (
                <>
                  {card && (
                    <button onClick={() => apply('charge')} disabled={!!busy || !!q.error} style={{ ...btn('green'), opacity: q.error ? 0.4 : 1 }}>
                      {busy === 'charge' ? 'CHARGING…' : `CHARGE ${card.brand?.replace('_', ' ')} ****${card.last4} +$${owed.toFixed(2)}`}
                    </button>
                  )}
                  {card?.alert && (
                    <div style={{ fontSize: 11, color: '#fbbf24', lineHeight: 1.6 }}>
                      Square flagged this card ({card.alert.type}) — it may decline.
                    </div>
                  )}
                  <button onClick={() => setKeying(true)} disabled={!!busy || !!q.error} style={{ ...btn('plain'), opacity: q.error ? 0.4 : 1 }}>
                    {cards.length > 0 ? 'DIFFERENT CARD' : `KEY IN A CARD +$${owed.toFixed(2)}`}
                  </button>
                </>
              )}

              {q.delta === 0 && q.proposed !== q.current && (
                <button onClick={() => apply('none')} disabled={!!busy || !!q.error} style={{ ...btn('plain'), opacity: q.error ? 0.4 : 1 }}>
                  {busy === 'none' ? 'SAVING…' : `SET PARTY SIZE TO ${q.proposed}`}
                </button>
              )}

              {q.delta !== 0 && (
                <button onClick={() => apply('none')} disabled={!!busy || !!q.error}
                  style={{ ...btn('plain'), opacity: q.error ? 0.4 : 0.75, fontSize: 10 }}>
                  {busy === 'none' ? 'SAVING…' : 'CHANGE THE COUNT ONLY, NO MONEY'}
                </button>
              )}

              <button onClick={onClose} disabled={!!busy} style={{ ...btn('plain'), border: 'none', color: 'rgba(255,255,255,0.4)', fontSize: 10 }}>
                CANCEL
              </button>
            </div>
          </>
        )}

        {done && (
          <>
            <div style={{ fontSize: 13, lineHeight: 1.7, color: '#4ade80', marginBottom: 14 }}>{done}</div>
            {warning && <div style={{ fontSize: 12, lineHeight: 1.7, color: '#fbbf24', marginBottom: 14 }}>{warning}</div>}
            <button onClick={onClose} style={btn('plain')}>DONE</button>
          </>
        )}
      </div>
    </div>
  )
}
