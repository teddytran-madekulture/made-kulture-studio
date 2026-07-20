'use client'

// Admin "Add charge" — bill a booking for equipment they used and/or any
// one-off fee, then charge the card on file or key a new card in. Works on any
// booking, past or present (after-the-fact equipment/damage/fee charges).
//
// Two payment paths:
//   • a saved card (card on file or another card on the customer's Square
//     profile) — charged straight through /add-charge, no card entry needed
//   • a keyed-in card — reuses <AdminCardCharge> pointed at the same endpoint,
//     with the line items passed through as extra payload

import { useCallback, useEffect, useMemo, useState } from 'react'
import AdminCardCharge from '@/components/AdminCardCharge'

interface Gear {
  id: string
  name: string
  rate: number
  category: string
}

interface SavedCard {
  id: string
  brand: string | null
  last4: string | null
  squareCustomerId: string
  isBookingCard?: boolean
  prepaidType?: string | null   // 'PREPAID' | 'NOT_PREPAID' | 'UNKNOWN'
  cardType?: string | null      // 'CREDIT' | 'DEBIT' | ...
}

export interface AddChargeBooking {
  id: string
  customer_id: string | null
  start_time: string
  customers: { name?: string; email?: string; phone?: string } | null
}

interface CustomLine { label: string; amount: string }

const CATEGORY_LABELS: Record<string, string> = {
  lighting:        'Lighting',
  modifier:        'Modifiers',
  special_effects: 'Special Effects',
  camera:          'Camera',
}
const CATEGORY_ORDER = ['lighting', 'modifier', 'special_effects', 'camera']

export default function AddChargeModal({
  booking, onClose, onSuccess,
}: { booking: AddChargeBooking; onClose: () => void; onSuccess: () => void }) {
  const [gear, setGear]           = useState<Gear[]>([])
  const [cards, setCards]         = useState<SavedCard[]>([])
  const [loading, setLoading]     = useState(true)
  const [qty, setQty]             = useState<Record<string, number>>({})
  const [custom, setCustom]       = useState<CustomLine[]>([{ label: '', amount: '' }])
  const [chosenCardId, setChosen] = useState<string | null>(null)
  const [sendSms, setSendSms]     = useState(true)
  const [keying, setKeying]       = useState(false)
  const [busy, setBusy]           = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null)  // cardId pending removal
  const [removing, setRemoving]   = useState(false)

  // Load the equipment catalog + the customer's saved cards.
  useEffect(() => {
    let alive = true
    Promise.all([
      fetch('/api/equipment').then(r => r.json()).catch(() => ({ equipment: [] })),
      fetch(`/api/admin/booking-cards?bookingId=${booking.id}`).then(r => r.json()).catch(() => ({ cards: [] })),
    ]).then(([eq, cd]) => {
      if (!alive) return
      setGear(eq.equipment ?? [])
      const list: SavedCard[] = cd.cards ?? []
      setCards(list)
      setChosen(list[0]?.id ?? null)
      setLoading(false)
    })
    return () => { alive = false }
  }, [booking.id])

  const bump = (id: string, d: number) =>
    setQty(q => {
      const n = Math.max(0, (q[id] || 0) + d)
      const next = { ...q }
      if (n === 0) delete next[id]; else next[id] = n
      return next
    })

  // Build the charge lines from selected gear + filled custom rows.
  const lines = useMemo(() => {
    const eq = gear
      .filter(g => (qty[g.id] || 0) > 0)
      .map(g => ({
        label: g.name, equipmentId: g.id, unitRate: g.rate,
        quantity: qty[g.id], amount: Math.round(g.rate * qty[g.id] * 100) / 100,
      }))
    const cl = custom
      .map(c => ({ label: c.label.trim(), amount: Math.round((Number(c.amount) || 0) * 100) / 100 }))
      .filter(c => c.label && c.amount > 0)
      .map(c => ({ label: c.label, amount: c.amount }))
    return [...eq, ...cl]
  }, [gear, qty, custom])

  const total = useMemo(() => Math.round(lines.reduce((s, l) => s + l.amount, 0) * 100) / 100, [lines])
  const chosenCard = cards.find(c => c.id === chosenCardId) || null

  // Charge a saved card straight through — no card entry needed.
  const chargeSaved = useCallback(async () => {
    if (busy || total <= 0 || !chosenCard) return
    setBusy(true); setError(null)
    try {
      const res = await fetch(`/api/admin/bookings/${booking.id}/add-charge`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          lines,
          squareCardId:     chosenCard.id,
          squareCustomerId: chosenCard.squareCustomerId,
          sendSms,
        }),
      })
      const d = await res.json()
      if (res.ok && d.success) { onSuccess() }
      else { setError(d.error || 'Charge failed — try again.'); setBusy(false) }
    } catch {
      setError('Something went wrong. Please try again.'); setBusy(false)
    }
  }, [busy, total, chosenCard, booking.id, lines, sendSms, onSuccess])

  // Permanently remove a dead / unusable card on file.
  const removeCard = useCallback(async (cardId: string) => {
    if (removing) return
    setRemoving(true); setError(null)
    try {
      const res = await fetch('/api/admin/cards/disable', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cardId }),
      })
      const d = await res.json()
      if (res.ok && d.success) {
        setCards(cs => {
          const next = cs.filter(c => c.id !== cardId)
          setChosen(prev => (prev === cardId ? (next[0]?.id ?? null) : prev))
          return next
        })
        setConfirmRemove(null)
      } else {
        setError(d.error || 'Could not remove the card.')
      }
    } catch {
      setError('Could not remove the card.')
    }
    setRemoving(false)
  }, [removing])

  const label: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.5)' }
  const summary = lines.map(l => ('quantity' in l && (l as any).quantity > 1 ? `${(l as any).quantity}× ${l.label}` : l.label)).join(', ')

  // Keyed-card path: reuse AdminCardCharge, aimed at our endpoint, lines in tow.
  if (keying) {
    return (
      <AdminCardCharge
        amount={total}
        title="KEY IN A CARD"
        description={`Made Kulture — ${summary}`}
        bookingId={booking.id}
        customerId={booking.customer_id}
        customerEmail={booking.customers?.email}
        customerPhone={booking.customers?.phone}
        customerName={booking.customers?.name}
        sendSmsDefault={sendSms}
        endpoint={`/api/admin/bookings/${booking.id}/add-charge`}
        extraPayload={{ lines }}
        onClose={() => setKeying(false)}
        onSuccess={onSuccess}
      />
    )
  }

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget && !busy) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#111', border: '1px solid rgba(255,255,255,0.12)', width: '100%', maxWidth: 480, maxHeight: '90vh', overflowY: 'auto', padding: 32, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.05em' }}>ADD CHARGE</div>
          <button onClick={onClose} disabled={busy}
            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: busy ? 'default' : 'pointer', fontSize: 20 }}>
            &#x2715;
          </button>
        </div>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 20 }}>
          {booking.customers?.name || 'Customer'} · {new Date(booking.start_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'rgba(255,255,255,0.4)', letterSpacing: '0.15em', fontSize: 12 }}>LOADING…</div>
        ) : (
          <>
            {/* EQUIPMENT */}
            <div style={{ ...label, marginBottom: 10 }}>EQUIPMENT</div>
            <div style={{ border: '1px solid rgba(255,255,255,0.1)', maxHeight: 220, overflowY: 'auto', marginBottom: 20 }}>
              {gear.length === 0 && (
                <div style={{ padding: 14, fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>No equipment in the catalog.</div>
              )}
              {CATEGORY_ORDER.filter(cat => gear.some(g => g.category === cat)).map(cat => (
                <div key={cat}>
                  <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 9, fontWeight: 600, letterSpacing: '0.2em', color: '#d4a843', padding: '10px 12px 4px', background: 'rgba(255,255,255,0.02)' }}>
                    {(CATEGORY_LABELS[cat] || cat).toUpperCase()}
                  </div>
                  {gear.filter(g => g.category === cat).map(g => {
                    const n = qty[g.id] || 0
                    return (
                      <div key={g.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderTop: '1px solid rgba(255,255,255,0.05)', background: n > 0 ? 'rgba(74,222,128,0.06)' : 'transparent' }}>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{g.name}</div>
                          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>${g.rate}</div>
                        </div>
                        <button onClick={() => bump(g.id, -1)} disabled={n === 0}
                          style={{ width: 26, height: 26, border: '1px solid rgba(255,255,255,0.2)', background: 'transparent', color: n === 0 ? 'rgba(255,255,255,0.2)' : '#fff', cursor: n === 0 ? 'default' : 'pointer', fontSize: 16, lineHeight: 1 }}>−</button>
                        <span style={{ width: 18, textAlign: 'center', fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#fff' }}>{n}</span>
                        <button onClick={() => bump(g.id, 1)}
                          style={{ width: 26, height: 26, border: '1px solid rgba(74,222,128,0.4)', background: 'rgba(74,222,128,0.1)', color: '#4ade80', cursor: 'pointer', fontSize: 16, lineHeight: 1 }}>+</button>
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>

            {/* OTHER / FREE-FORM */}
            <div style={{ ...label, marginBottom: 10 }}>OTHER (CLEANING FEE, DAMAGE, ETC.)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 8 }}>
              {custom.map((c, i) => (
                <div key={i} style={{ display: 'flex', gap: 8 }}>
                  <input value={c.label} placeholder="Description"
                    onChange={e => setCustom(rows => rows.map((r, j) => j === i ? { ...r, label: e.target.value } : r))}
                    style={{ flex: 1, background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.18)', color: '#fff', padding: '9px 10px', fontFamily: 'Inter, sans-serif', fontSize: 13, boxSizing: 'border-box' }} />
                  <div style={{ display: 'flex', alignItems: 'center', border: '1px solid rgba(255,255,255,0.18)', background: '#0d0d0d', paddingLeft: 8, width: 96 }}>
                    <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>$</span>
                    <input value={c.amount} placeholder="0" inputMode="decimal"
                      onChange={e => setCustom(rows => rows.map((r, j) => j === i ? { ...r, amount: e.target.value.replace(/[^0-9.]/g, '') } : r))}
                      style={{ width: '100%', background: 'transparent', border: 'none', color: '#fff', padding: '9px 8px', fontFamily: 'Inter, sans-serif', fontSize: 13, outline: 'none' }} />
                  </div>
                </div>
              ))}
            </div>
            <button onClick={() => setCustom(rows => [...rows, { label: '', amount: '' }])}
              style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.1em', padding: 0, marginBottom: 22 }}>
              + ADD ANOTHER LINE
            </button>

            {/* TOTAL */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.12)' }}>
              <span style={label}>TOTAL</span>
              <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 32, color: '#4ade80', letterSpacing: '0.03em' }}>${total.toFixed(2)}</span>
            </div>

            {/* SAVED CARDS */}
            {cards.length > 0 && (
              <div style={{ marginTop: 18 }}>
                <div style={{ ...label, marginBottom: 8 }}>CHARGE CARD ON FILE</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {cards.map(c => {
                    const prepaid = c.prepaidType === 'PREPAID'
                    return (
                      <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', border: `1px solid ${c.id === chosenCardId ? 'rgba(74,222,128,0.5)' : 'rgba(255,255,255,0.14)'}` }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', flex: 1, minWidth: 0 }}>
                          <input type="radio" name="mkcard" checked={c.id === chosenCardId} onChange={() => setChosen(c.id)} />
                          <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#fff' }}>
                            {(c.brand || 'Card').replace('_', ' ')} ····{c.last4}
                            {c.isBookingCard && <span style={{ color: '#d4a843', fontSize: 10, letterSpacing: '0.1em', marginLeft: 8 }}>ON FILE</span>}
                            {prepaid && <span style={{ color: '#f5a623', fontSize: 10, letterSpacing: '0.1em', marginLeft: 8, border: '1px solid rgba(245,166,35,0.4)', padding: '1px 5px' }}>PREPAID</span>}
                          </span>
                        </label>
                        {confirmRemove === c.id ? (
                          <span style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                            <button onClick={() => removeCard(c.id)} disabled={removing}
                              style={{ background: 'rgba(255,107,107,0.15)', border: '1px solid rgba(255,107,107,0.4)', color: '#ff6b6b', fontFamily: 'Inter, sans-serif', fontSize: 10, letterSpacing: '0.1em', padding: '4px 8px', cursor: removing ? 'default' : 'pointer' }}>
                              {removing ? '…' : 'REMOVE'}
                            </button>
                            <button onClick={() => setConfirmRemove(null)} disabled={removing}
                              style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 14, cursor: 'pointer' }}>&#x2715;</button>
                          </span>
                        ) : (
                          <button onClick={() => setConfirmRemove(c.id)} title="Remove this card (use for dead/declined cards)"
                            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.35)', fontSize: 15, cursor: 'pointer', flexShrink: 0, lineHeight: 1 }}>&#x2715;</button>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16, cursor: 'pointer' }}>
              <input type="checkbox" checked={sendSms} onChange={e => setSendSms(e.target.checked)} />
              <span style={label}>TEXT THE CUSTOMER A RECEIPT</span>
            </label>

            {error && <div style={{ color: '#ff6b6b', fontSize: 13, marginTop: 14, lineHeight: 1.5 }}>{error}</div>}

            {/* ACTIONS */}
            {cards.length > 0 ? (
              <>
                <button onClick={chargeSaved} disabled={busy || total <= 0 || !chosenCard}
                  style={{ width: '100%', marginTop: 18, padding: 14, background: !busy && total > 0 ? '#4ade80' : 'rgba(74,222,128,0.4)', border: 'none', color: '#080808', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', cursor: !busy && total > 0 ? 'pointer' : 'default' }}>
                  {busy ? 'CHARGING…' : `CHARGE $${total.toFixed(2)}${chosenCard ? ` TO ····${chosenCard.last4}` : ''}`}
                </button>
                <button onClick={() => setKeying(true)} disabled={busy || total <= 0}
                  style={{ width: '100%', marginTop: 10, padding: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.14em', cursor: busy || total <= 0 ? 'default' : 'pointer' }}>
                  KEY IN A DIFFERENT CARD
                </button>
              </>
            ) : (
              <button onClick={() => setKeying(true)} disabled={busy || total <= 0}
                style={{ width: '100%', marginTop: 18, padding: 14, background: total > 0 ? '#4ade80' : 'rgba(74,222,128,0.4)', border: 'none', color: '#080808', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', cursor: total > 0 ? 'pointer' : 'default' }}>
                {`KEY IN A CARD → $${total.toFixed(2)}`}
              </button>
            )}

            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', textAlign: 'center', marginTop: 12, lineHeight: 1.6 }}>
              Charges via Square. Adds to the booking total and logs a note on the customer.
            </div>
          </>
        )}
      </div>
    </div>
  )
}
