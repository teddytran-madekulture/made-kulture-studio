'use client'

// Admin "Overtime" — bill a session that ran past its booked end time.
//
// Studio policy is that running more than 15 minutes over is charged an extra
// hour, and a HUMAN does that — nothing in this codebase has ever auto-charged
// for a time overrun, and this modal doesn't change that. It just makes the
// human's version one tap instead of a trip to Square.
//
// Two ways out, and the default is deliberately the polite one:
//   • TEXT TO CONFIRM — mints a confirm-and-pay link and texts it to the guest's
//     own phone. They tap, it charges. Works even with no card on file (the
//     confirm page shows a card field). Nothing is charged until they agree.
//   • CHARGE NOW — hits the card on file straight away, per the policy they
//     already agreed to. Needs a saved card.
//
// CHARGE vs EXTEND: charging overtime never moves end_time. The set is usually
// booked right behind them — that's exactly when running over costs somebody
// something — so the booking window is left alone and only the money moves.

import { useCallback, useEffect, useMemo, useState } from 'react'

interface SavedCard {
  id: string
  brand: string | null
  last4: string | null
  squareCustomerId: string
  prepaidType?: string | null
}

export interface OvertimeBooking {
  id: string
  customer_id: string | null
  start_time: string
  end_time: string
  checked_out_at?: string | null
  total_amount?: number | null
  sets: { name?: string } | null
  customers: { name?: string; email?: string; phone?: string } | null
}

const CHOICES = [0.5, 1, 1.5, 2]

function durationLabel(hours: number): string {
  const mins = Math.round(hours * 60)
  if (mins < 60) return `${mins} minutes`
  const h = Math.floor(mins / 60)
  const m = mins % 60
  if (m === 0) return `${h} hour${h > 1 ? 's' : ''}`
  return `${h} hr ${m} min`
}

function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso))
}

export default function OvertimeModal({
  booking, rate, onClose, onSuccess,
}: {
  booking: OvertimeBooking
  rate: number
  onClose: () => void
  onSuccess: () => void
}) {
  const [cards, setCards]   = useState<SavedCard[]>([])
  const [cardId, setCardId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy]     = useState<'text' | 'charge' | null>(null)
  const [error, setError]   = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [sendSms, setSendSms] = useState(true)

  // How far over did they actually run? Real checkout stamp when there is one,
  // otherwise the clock right now (the session is still open).
  const minsOver = useMemo(() => {
    const end = Date.parse(booking.end_time)
    if (!Number.isFinite(end)) return 0
    const out = booking.checked_out_at ? Date.parse(booking.checked_out_at) : Date.now()
    return Math.max(0, Math.round((out - end) / 60000))
  }, [booking.end_time, booking.checked_out_at])

  // Policy default: past 15 minutes is an hour. Under that, offer the half hour
  // and let the decision be made on purpose rather than by a pre-filled field.
  const [hours, setHours] = useState<number>(minsOver > 15 ? 1 : 0.5)

  useEffect(() => {
    let alive = true
    fetch(`/api/admin/booking-cards?bookingId=${booking.id}`)
      .then(r => r.json())
      .then(d => {
        if (!alive) return
        const list: SavedCard[] = d.cards ?? []
        setCards(list)
        setCardId(list[0]?.id ?? null)
      })
      .catch(() => { /* no cards → text-to-confirm still works */ })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [booking.id])

  const amount = Math.round(rate * hours * 100) / 100
  const chosenCard = cards.find(c => c.id === cardId) ?? null
  const setName = booking.sets?.name || 'the studio'

  const sendText = useCallback(async () => {
    if (busy) return
    setBusy('text'); setError(null)
    try {
      const r = await fetch(`/api/admin/bookings/${booking.id}/extension`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hours, kind: 'overage' }),
      })
      const d = await r.json()
      if (r.ok && d.success) {
        setResult(`Text sent to ${d.sentTo} — $${Number(d.amount).toFixed(2)} for ${d.durationLabel}. Nothing is charged until they confirm.`)
      } else {
        setError(d.error || 'Could not send the text.')
      }
    } catch {
      setError('Connection problem — try again.')
    }
    setBusy(null)
  }, [booking.id, hours, busy])

  const chargeNow = useCallback(async () => {
    if (busy || !chosenCard) return
    setBusy('charge'); setError(null)
    try {
      // Reuses the add-charge endpoint: it records the line, bumps the booking
      // total and logs a customer note, all of which overtime needs too.
      const r = await fetch(`/api/admin/bookings/${booking.id}/add-charge`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines: [{ label: `${durationLabel(hours)} overtime — ${setName}`, amount }],
          squareCardId: chosenCard.id,
          squareCustomerId: chosenCard.squareCustomerId,
          customerId: booking.customer_id,
          email: booking.customers?.email,
          phone: booking.customers?.phone,
          customerName: booking.customers?.name,
          sendSms,
        }),
      })
      const d = await r.json()
      if (r.ok && d.success) {
        onSuccess()
      } else {
        setError(d.error || 'Charge failed.')
      }
    } catch {
      setError('Connection problem — try again.')
    }
    setBusy(null)
  }, [booking, hours, amount, chosenCard, sendSms, setName, busy, onSuccess])

  const label: React.CSSProperties = {
    fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.5)',
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#111', border: '1px solid rgba(255,255,255,0.12)', width: '100%', maxWidth: 460, maxHeight: 'calc(90 * var(--svh))', overflowY: 'auto', padding: 32, boxSizing: 'border-box' }}>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.05em' }}>CHARGE OVERTIME</div>
          <button onClick={onClose} disabled={!!busy}
            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: busy ? 'default' : 'pointer', fontSize: 20 }}>
            &#x2715;
          </button>
        </div>

        {result ? (
          <>
            <div style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', padding: '16px', fontSize: 13, color: '#4ade80', lineHeight: 1.6 }}>
              {result}
            </div>
            <button onClick={onClose}
              style={{ width: '100%', marginTop: 20, padding: '13px', background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.14em', cursor: 'pointer' }}>
              DONE
            </button>
          </>
        ) : (
          <>
            {/* What actually happened */}
            <div style={{ background: 'rgba(255,255,255,0.04)', padding: 14, marginBottom: 20, fontSize: 12, lineHeight: 1.9, color: 'rgba(255,255,255,0.6)' }}>
              <div>{booking.customers?.name || 'Guest'} · {setName}</div>
              <div>Booked until <span style={{ color: '#fff' }}>{fmtTime(booking.end_time)}</span></div>
              <div>
                {booking.checked_out_at
                  ? <>Checked out <span style={{ color: '#fff' }}>{fmtTime(booking.checked_out_at)}</span></>
                  : <span style={{ color: '#ffb066' }}>Still hasn’t checked out</span>}
              </div>
              {minsOver > 0 && (
                <div style={{ color: '#ffb066', fontWeight: 600 }}>
                  Ran {minsOver} min over{minsOver > 15 ? ' — past the 15-minute grace' : ' — inside the 15-minute grace'}
                </div>
              )}
            </div>

            {/* How much time to bill */}
            <div style={{ ...label, marginBottom: 8 }}>TIME TO CHARGE</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 16 }}>
              {CHOICES.map(h => (
                <button key={h} onClick={() => setHours(h)} disabled={!!busy}
                  style={{
                    padding: '12px 4px', cursor: busy ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11,
                    background: hours === h ? 'rgba(212,168,67,0.18)' : 'transparent',
                    border: `1px solid ${hours === h ? 'rgba(212,168,67,0.6)' : 'rgba(255,255,255,0.15)'}`,
                    color: hours === h ? '#e6c07a' : 'rgba(255,255,255,0.6)',
                  }}>
                  {h < 1 ? '30 min' : h === 1 ? '1 hr' : h === 1.5 ? '1.5 hr' : '2 hr'}
                </button>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.1)', borderBottom: '1px solid rgba(255,255,255,0.1)', marginBottom: 18 }}>
              <span style={label}>{durationLabel(hours)} @ ${rate}/hr</span>
              <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, color: '#4ade80' }}>${amount.toFixed(2)}</span>
            </div>

            {error && <div style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 14, lineHeight: 1.5 }}>{error}</div>}

            {/* The polite path, and the default */}
            <button onClick={sendText} disabled={!!busy}
              style={{
                width: '100%', padding: '15px', background: busy === 'text' ? 'rgba(212,168,67,0.4)' : 'linear-gradient(135deg, #d7c08b, #9c8250)',
                border: 'none', color: '#0b0b0d', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 800, letterSpacing: '0.14em',
                cursor: busy ? 'default' : 'pointer',
              }}>
              {busy === 'text' ? 'SENDING…' : `TEXT TO CONFIRM · $${amount.toFixed(2)}`}
            </button>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', textAlign: 'center', margin: '8px 0 20px', lineHeight: 1.6 }}>
              Texts a confirm-and-pay link to their phone. Nothing is charged until they tap it.
              {!loading && cards.length === 0 && ' They can enter a card there — no card on file needed.'}
            </div>

            {/* The direct path */}
            <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 18 }}>
              {loading ? (
                <div style={{ ...label, textAlign: 'center' }}>CHECKING FOR A CARD ON FILE…</div>
              ) : cards.length === 0 ? (
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>
                  No card on file for this customer, so there’s nothing to charge directly — use the text above.
                </div>
              ) : (
                <>
                  <div style={{ ...label, marginBottom: 8 }}>OR CHARGE A SAVED CARD NOW</div>
                  <select value={cardId ?? ''} onChange={e => setCardId(e.target.value)} disabled={!!busy}
                    style={{
                      width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.15)',
                      color: '#fff', padding: '11px', fontFamily: 'Inter, sans-serif', fontSize: 12, appearance: 'none',
                      boxSizing: 'border-box', marginBottom: 12,
                    }}>
                    {cards.map(c => (
                      <option key={c.id} value={c.id} style={{ background: '#111' }}>
                        {c.brand?.replace('_', ' ')} ****{c.last4}{c.prepaidType === 'PREPAID' ? ' · PREPAID' : ''}
                      </option>
                    ))}
                  </select>

                  {chosenCard?.prepaidType === 'PREPAID' && (
                    <div style={{ fontSize: 11, color: '#fbbf24', marginBottom: 12, lineHeight: 1.6 }}>
                      ⚠️ Prepaid card — these are usually drained by the time an after-the-fact charge lands. The text is the safer bet.
                    </div>
                  )}

                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, cursor: 'pointer' }}>
                    <input type="checkbox" checked={sendSms} onChange={e => setSendSms(e.target.checked)} />
                    <span style={label}>TEXT THEM A RECEIPT</span>
                  </label>

                  <button onClick={chargeNow} disabled={!!busy || !chosenCard}
                    style={{
                      width: '100%', padding: '13px', background: 'rgba(74,222,128,0.15)',
                      border: '1px solid rgba(74,222,128,0.35)', color: '#4ade80',
                      fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.14em',
                      cursor: busy || !chosenCard ? 'default' : 'pointer',
                    }}>
                    {busy === 'charge' ? 'CHARGING…' : `CHARGE ****${chosenCard?.last4} NOW · $${amount.toFixed(2)}`}
                  </button>
                </>
              )}
            </div>

            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.28)', textAlign: 'center', marginTop: 16, lineHeight: 1.6 }}>
              Either way, their booked end time stays where it is — only the charge is added.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
