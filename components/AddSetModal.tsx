'use client'

// "Add another set" — book a SECOND, different set for an existing customer at any
// date/time (an extension can only push the end time of the one set they're in).
// Picks a set + window, checks the set is actually free, then charges the same
// customer (a saved card found across their Square profiles, or a keyed-in card)
// and creates the booking. All the heavy lifting is in POST /api/admin/add-set.

import { useCallback, useEffect, useState } from 'react'
import AdminCardCharge from './AdminCardCharge'

interface SetOpt { name: string; rate: number }
interface SavedCard {
  id: string; brand: string; last4: string
  expMonth: number | null; expYear: number | null; squareCustomerId?: string
}
interface Booking {
  id: string
  customer_id: string | null
  start_time: string
  customers: { name: string; email: string; phone: string } | null
}

export interface AddSetModalProps {
  booking: Booking
  sets: SetOpt[]
  defaultDate: string          // YYYY-MM-DD (the source booking's date)
  onClose: () => void
  onSuccess: () => void
}

const HOURS = Array.from({ length: 14 }, (_, i) => i + 9) // 9..22
function hourLabel(h: number) {
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:00 ${ampm}`
}

export default function AddSetModal({ booking, sets, defaultDate, onClose, onSuccess }: AddSetModalProps) {
  const cust = booking.customers
  const [setName, setSetName]     = useState(sets[0]?.name ?? '')
  const [date, setDate]           = useState(defaultDate)
  const [startHour, setStartHour] = useState(9)
  const [endHour, setEndHour]     = useState(10)
  const [avail, setAvail]         = useState<'idle' | 'checking' | 'free' | 'taken' | 'error'>('idle')
  const [price, setPrice]         = useState(0)
  const [cards, setCards]         = useState<SavedCard[]>([])
  const [selCard, setSelCard]     = useState<SavedCard | null>(null)
  const [sendSms, setSendSms]     = useState(true)
  const [charging, setCharging]   = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [showKeyed, setShowKeyed] = useState(false)

  const rate = sets.find(s => s.name === setName)?.rate ?? 0
  const hours = Math.max(0, endHour - startHour)
  const localPrice = rate * hours

  // Load the customer's saved cards (robust: across duplicate Square profiles).
  useEffect(() => {
    let on = true
    fetch(`/api/admin/booking-cards?bookingId=${booking.id}`)
      .then(r => r.json())
      .then(d => { if (on) { const list = (d.cards || []) as SavedCard[]; setCards(list); setSelCard(list[0] ?? null) } })
      .catch(() => {})
    return () => { on = false }
  }, [booking.id])

  // Check availability + authoritative price whenever the window changes.
  useEffect(() => {
    if (!setName || !date || !(endHour > startHour)) { setAvail('idle'); return }
    let on = true
    setAvail('checking'); setError(null)
    const q = new URLSearchParams({ setName, date, startHour: String(startHour), endHour: String(endHour) })
    fetch(`/api/admin/add-set?${q}`)
      .then(r => r.json())
      .then(d => {
        if (!on) return
        if (d.error) { setAvail('error'); setError(d.error); return }
        setPrice(typeof d.price === 'number' ? d.price : localPrice)
        setAvail(d.available ? 'free' : 'taken')
      })
      .catch(() => { if (on) setAvail('error') })
    return () => { on = false }
  }, [setName, date, startHour, endHour]) // eslint-disable-line react-hooks/exhaustive-deps

  const chargeSaved = useCallback(async () => {
    if (!selCard || charging || avail !== 'free') return
    setCharging(true); setError(null)
    try {
      const res = await fetch('/api/admin/add-set', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          setName, date, startHour, endHour,
          customerId: booking.customer_id,
          name: cust?.name, email: cust?.email, phone: cust?.phone,
          squareCardId: selCard.id,
          squareCustomerId: selCard.squareCustomerId,
          sendSms,
        }),
      })
      const d = await res.json()
      if (res.ok && d.success) onSuccess()
      else { setError(d.error || 'Could not add the set.'); setCharging(false) }
    } catch {
      setError('Something went wrong. Please try again.'); setCharging(false)
    }
  }, [selCard, charging, avail, setName, date, startHour, endHour, booking.customer_id, cust, sendSms, onSuccess])

  const label: React.CSSProperties = { fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }
  const field: React.CSSProperties = { width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.14)', color: '#fff', padding: '10px 12px', fontFamily: 'Inter, sans-serif', fontSize: 13, boxSizing: 'border-box' }
  const cardLabel = (c: SavedCard) => `${(c.brand || 'CARD').replace('_', ' ')} ****${c.last4}`

  // Keyed-in card path reuses AdminCardCharge, posting to the add-set endpoint.
  if (showKeyed) {
    return (
      <AdminCardCharge
        amount={price || localPrice}
        title="CHARGE CARD"
        customerId={booking.customer_id}
        customerEmail={cust?.email}
        customerPhone={cust?.phone}
        customerName={cust?.name}
        sendSmsDefault={sendSms}
        endpoint="/api/admin/add-set"
        extraPayload={{ setName, date, startHour, endHour, name: cust?.name, email: cust?.email, phone: cust?.phone }}
        onClose={() => setShowKeyed(false)}
        onSuccess={onSuccess}
      />
    )
  }

  const availLine = {
    idle:     { t: '', c: '' },
    checking: { t: 'Checking availability…', c: 'rgba(255,255,255,0.4)' },
    free:     { t: '✓ Available', c: '#4ade80' },
    taken:    { t: '✕ That set is booked for this window', c: '#ff6b6b' },
    error:    { t: error || 'Could not check availability', c: '#ff6b6b' },
  }[avail]

  return (
    <div onClick={e => { if (e.target === e.currentTarget && !charging) onClose() }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 250, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ background: '#111', border: '1px solid rgba(255,255,255,0.12)', width: '100%', maxWidth: 460, maxHeight: '90vh', overflowY: 'auto', padding: 32, boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.05em' }}>ADD ANOTHER SET</div>
          <button onClick={onClose} disabled={charging}
            style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: charging ? 'default' : 'pointer', fontSize: 20 }}>&#x2715;</button>
        </div>
        <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 20 }}>
          for {cust?.name || 'this customer'}
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={label}>SET</label>
          <select value={setName} onChange={e => setSetName(e.target.value)} style={{ ...field, appearance: 'none' as const }}>
            {sets.map(s => <option key={s.name} value={s.name} style={{ background: '#111' }}>{s.name} — ${s.rate}/hr</option>)}
          </select>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={label}>DATE</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={field} />
        </div>

        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div style={{ flex: 1 }}>
            <label style={label}>START</label>
            <select value={startHour} onChange={e => setStartHour(Number(e.target.value))} style={{ ...field, appearance: 'none' as const }}>
              {HOURS.map(h => <option key={h} value={h} style={{ background: '#111' }}>{hourLabel(h)}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}>
            <label style={label}>END</label>
            <select value={endHour} onChange={e => setEndHour(Number(e.target.value))} style={{ ...field, appearance: 'none' as const }}>
              {HOURS.filter(h => h > startHour).map(h => <option key={h} value={h} style={{ background: '#111' }}>{hourLabel(h)}</option>)}
            </select>
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', padding: '12px 0', borderTop: '1px solid rgba(255,255,255,0.08)', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 12 }}>
          <span style={{ ...label, marginBottom: 0 }}>{hours}hr × ${rate}/hr</span>
          <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 26, color: '#4ade80' }}>${(price || localPrice).toFixed(2)}</span>
        </div>

        {availLine.t && <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: availLine.c, marginBottom: 14 }}>{availLine.t}</div>}

        {avail === 'free' && (
          <>
            {cards.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <label style={label}>CARD ON FILE</label>
                <select value={selCard?.id || ''} onChange={e => setSelCard(cards.find(c => c.id === e.target.value) || null)} style={{ ...field, appearance: 'none' as const }}>
                  {cards.map(c => <option key={c.id} value={c.id} style={{ background: '#111' }}>{cardLabel(c)}</option>)}
                </select>
              </div>
            )}

            <label style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 16px', cursor: 'pointer' }}>
              <input type="checkbox" checked={sendSms} onChange={e => setSendSms(e.target.checked)} />
              <span style={{ ...label, marginBottom: 0 }}>TEXT THE CUSTOMER A CONFIRMATION</span>
            </label>

            {error && <div style={{ color: '#ff6b6b', fontSize: 13, marginBottom: 12 }}>{error}</div>}

            {cards.length > 0 && selCard && (
              <button onClick={chargeSaved} disabled={charging}
                style={{ width: '100%', padding: '14px', background: charging ? 'rgba(74,222,128,0.4)' : '#4ade80', border: 'none', color: '#080808', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 700, letterSpacing: '0.14em', cursor: charging ? 'default' : 'pointer' }}>
                {charging ? 'BOOKING…' : `CHARGE ${cardLabel(selCard)} · $${(price || localPrice).toFixed(2)}`}
              </button>
            )}

            <button onClick={() => setShowKeyed(true)} disabled={charging}
              style={{ width: '100%', marginTop: 10, padding: '12px', background: 'rgba(74,222,128,0.12)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.12em', cursor: charging ? 'default' : 'pointer' }}>
              {cards.length > 0 ? 'USE A DIFFERENT CARD' : `ENTER CARD · $${(price || localPrice).toFixed(2)}`}
            </button>
          </>
        )}
      </div>
    </div>
  )
}
