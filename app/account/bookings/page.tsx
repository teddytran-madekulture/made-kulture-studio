'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { googleCalUrl, STUDIO_ADDRESS } from '@/lib/calendar'

interface Booking {
  id: string
  start_time: string
  end_time: string
  status: string
  total_price: number
  customer_name: string
  acuity_appointment_id: string | null
  sets: { name: string } | null
  booking_add_ons?: { quantity: number; rate: number; paid?: boolean; equipment: { name: string } | null }[]
}

interface GearLine { id: string; name: string; rate: number; quantity: number }
const GEAR_CART_KEY = 'mk_gear_cart'
function loadGearCart(): GearLine[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(GEAR_CART_KEY) || '[]') } catch { return [] }
}

const fmt = (d: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago',
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(new Date(d))

export default function BookingsPage() {
  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading]   = useState(true)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [error, setError]       = useState('')
  const [gearCart, setGearCart] = useState<GearLine[]>([])
  const [addingTo, setAddingTo] = useState<string | null>(null)

  const refetch = () =>
    fetch('/api/account/bookings').then(r => r.json()).then(d => { setBookings(d.bookings ?? []); setLoading(false) })

  useEffect(() => { refetch(); setGearCart(loadGearCart()) }, [])

  const cartTotal = gearCart.reduce((s, l) => s + l.rate * l.quantity, 0)

  const addGear = async (bookingId: string) => {
    setAddingTo(bookingId); setError('')
    try {
      const res = await fetch(`/api/account/bookings/${bookingId}/add-gear`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ equipment: gearCart.map(l => ({ equipment_id: l.id, quantity: l.quantity })) }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not add gear'); setAddingTo(null); return }
      try { localStorage.removeItem(GEAR_CART_KEY) } catch {}
      setGearCart([])
      await refetch()
      if (data.url) window.open(data.url, '_blank', 'noopener')
    } catch {
      setError('Something went wrong adding gear.')
    }
    setAddingTo(null)
  }

  const cancel = async (id: string) => {
    if (!confirm('Cancel this booking? Refunds are only issued if cancelled 48+ hours in advance.')) return
    setCancelling(id); setError('')
    const res = await fetch('/api/account/cancel', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: id }),
    })
    const data = await res.json()
    if (!res.ok) {
      setError(data.error ?? 'Something went wrong')
      setCancelling(null)
    } else {
      setBookings(bs => bs.map(b => b.id === id ? { ...b, status: 'cancelled' } : b))
      setCancelling(null)
    }
  }

  const now = new Date()
  const upcoming = bookings.filter(b => new Date(b.start_time) > now && b.status !== 'cancelled')
  const past     = bookings.filter(b => new Date(b.start_time) <= now || b.status === 'cancelled')

  const Card = ({ b }: { b: Booking }) => {
    const isUpcoming = new Date(b.start_time) > now && b.status !== 'cancelled'
    const isCancelled = b.status === 'cancelled'
    const hoursUntil = (new Date(b.start_time).getTime() - now.getTime()) / (1000 * 60 * 60)
    const canCancel = isUpcoming && hoursUntil > 48

    return (
      <div style={{ background: '#141414', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: '20px 24px', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 20, letterSpacing: '0.03em', marginBottom: 4 }}>
              {b.sets?.name ?? 'Studio'}
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 2 }}>
              {fmt(b.start_time)}
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
              {b.total_price != null ? `$${b.total_price.toFixed(2)}` : ''}
            </div>
            {(b.booking_add_ons?.length ?? 0) > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                <div style={{ fontFamily: 'Inter', fontSize: 10, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.3)', marginBottom: 4 }}>GEAR</div>
                {b.booking_add_ons!.map((a, i) => (
                  <div key={i} style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>
                    {a.equipment?.name ?? 'Item'}{a.quantity > 1 ? ` × ${a.quantity}` : ''}
                    {a.paid === false && <span style={{ color: '#e8c878', marginLeft: 6 }}>· payment pending</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <span style={{
              fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.08em', fontWeight: 600,
              padding: '4px 10px', borderRadius: 20,
              background: isCancelled ? 'rgba(255,60,60,0.1)' : isUpcoming ? 'rgba(60,255,120,0.1)' : 'rgba(255,255,255,0.05)',
              color: isCancelled ? '#ff6b6b' : isUpcoming ? '#6bffaa' : 'rgba(255,255,255,0.35)',
            }}>
              {b.status?.toUpperCase()}
            </span>
            {canCancel && (
              <button
                onClick={() => cancel(b.id)}
                disabled={cancelling === b.id}
                style={{ background: 'none', border: '1px solid rgba(255,60,60,0.3)', borderRadius: 4, padding: '6px 14px', fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.08em', color: '#ff6b6b', cursor: 'pointer', opacity: cancelling === b.id ? 0.5 : 1 }}
              >
                {cancelling === b.id ? 'CANCELLING...' : 'CANCEL'}
              </button>
            )}
            {isUpcoming && !canCancel && !isCancelled && (
              <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.2)' }}>Within 48hr window</span>
            )}
            {isUpcoming && !isCancelled && (
              <a href={googleCalUrl({ title: `Made Kulture — ${b.sets?.name ?? 'Studio'}`, startISO: b.start_time, endISO: b.end_time, location: STUDIO_ADDRESS, details: 'Your Made Kulture session.' })}
                target="_blank" rel="noopener noreferrer"
                style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.55)', textDecoration: 'none', border: '1px solid rgba(255,255,255,0.15)', borderRadius: 4, padding: '6px 12px', whiteSpace: 'nowrap' }}>
                + CALENDAR
              </a>
            )}
            {isUpcoming && gearCart.length > 0 && (
              <button
                onClick={() => addGear(b.id)}
                disabled={addingTo === b.id}
                style={{ background: '#fff', border: 'none', borderRadius: 4, padding: '6px 14px', fontFamily: 'Inter', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: '#080808', cursor: 'pointer', opacity: addingTo === b.id ? 0.5 : 1 }}
              >
                {addingTo === b.id ? 'ADDING…' : `+ ADD GEAR ($${cartTotal})`}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  if (loading) return <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.4)', paddingTop: 40 }}>Loading bookings...</div>

  return (
    <div>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: '0 0 8px' }}>MY BOOKINGS</h1>
      <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.35)', marginBottom: 32 }}>
        Cancellations must be made 48+ hours before the session for a full refund.
      </p>

      {error && (
        <div style={{ background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.2)', borderRadius: 4, padding: '12px 16px', fontFamily: 'Inter', fontSize: 13, color: '#ff6b6b', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {gearCart.length > 0 && (
        <div style={{ background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.3)', borderRadius: 4, padding: '14px 18px', fontFamily: 'Inter', fontSize: 13, color: '#e8c878', marginBottom: 20 }}>
          You have {gearCart.reduce((s, l) => s + l.quantity, 0)} gear item(s) in your cart (${cartTotal}). Pick an upcoming booking below and tap <strong>+ Add Gear</strong> — you&apos;ll get a payment link to confirm.
        </div>
      )}

      {upcoming.length === 0 && past.length === 0 && (
        <div style={{ textAlign: 'center', paddingTop: 60 }}>
          <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.35)', marginBottom: 20 }}>No bookings yet</div>
          <Link href="/availability" style={{ background: '#fff', color: '#000', borderRadius: 4, padding: '12px 24px', fontFamily: 'Inter', fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textDecoration: 'none' }}>
            BOOK A SET
          </Link>
        </div>
      )}

      {upcoming.length > 0 && (
        <div style={{ marginBottom: 40 }}>
          <h2 style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.3)', margin: '0 0 12px' }}>UPCOMING</h2>
          {upcoming.map(b => <Card key={b.id} b={b} />)}
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h2 style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.3)', margin: '0 0 12px' }}>PAST & CANCELLED</h2>
          {past.map(b => <Card key={b.id} b={b} />)}
        </div>
      )}
    </div>
  )
}
