'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { googleCalUrl, STUDIO_ADDRESS } from '@/lib/calendar'
import RescheduleModal from '@/components/RescheduleModal'
import SaveWithPlusModal from '@/components/SaveWithPlusModal'

interface Booking {
  id: string
  set_id?: string | null
  start_time: string
  end_time: string
  status: string
  total_price: number
  customer_name: string
  acuity_appointment_id: string | null
  sets: { name: string; slug?: string | null } | null
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
  const [rescheduling, setRescheduling] = useState<string | null>(null)
  const [error, setError]       = useState('')
  const [notice, setNotice]     = useState('')
  const [gearCart, setGearCart] = useState<GearLine[]>([])
  const [addingTo, setAddingTo] = useState<string | null>(null)
  const [isPlus, setIsPlus] = useState(false)
  const [moving, setMoving] = useState<Booking | null>(null)
  const [plusChecked, setPlusChecked] = useState(false)
  const [saving, setSaving] = useState<Booking | null>(null)
  // ?save=<bookingId> — set by the guest manage-link page, which sends a guest
  // through signup/login and back here to finish "save this booking with Plus".
  const [saveId, setSaveId] = useState<string | null>(null)

  const refetch = () =>
    fetch('/api/account/bookings').then(r => r.json()).then(d => { setBookings(d.bookings ?? []); setLoading(false) })

  useEffect(() => { refetch(); setGearCart(loadGearCart()); fetch('/api/account/plus').then(r => r.ok ? r.json() : null).then(d => setIsPlus(!!d?.active)).catch(() => {}).finally(() => setPlusChecked(true))
    try { setSaveId(new URLSearchParams(window.location.search).get('save')) } catch {}
  }, [])

  // Arrived from a manage link to save a booking. Wait until BOTH the bookings
  // and the Plus status are known, then act once.
  // ⚠️ /api/account/bookings finds a guest's bookings by the VERIFIED account
  // email, so a guest who signs up with the email they booked with sees the
  // booking here with no linking step. A different email (say, Google sign-in
  // on another address) finds nothing — say so rather than silently showing a
  // list without it.
  useEffect(() => {
    if (!saveId || loading || !plusChecked) return
    const b = bookings.find(x => x.id === saveId)
    setSaveId(null)
    try { window.history.replaceState(null, '', '/account/bookings') } catch {}
    if (!b) { setError('We couldn’t find that booking on this account. Sign in with the email address you booked with, or text (832) 408-1631.'); return }
    if (isPlus) { setNotice('You’re already a Plus member — use RESCHEDULE or CANCEL on your booking below.'); return }
    if (saveEligible(b)) setSaving(b)
  }, [saveId, loading, plusChecked, bookings, isPlus])

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

  const rescheduleCredit = async (id: string) => {
    if (!confirm('Reschedule later?\n\nThis releases your session and banks its full value as studio credit on your account. Credit never expires and applies automatically when you rebook — pick a new date whenever you’re ready.')) return
    setRescheduling(id); setError(''); setNotice('')
    const res = await fetch('/api/account/reschedule-credit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ booking_id: id }),
    })
    const data = await res.json()
    if (!res.ok) { setError(data.error ?? 'Something went wrong'); setRescheduling(null); return }
    setBookings(bs => bs.map(b => b.id === id ? { ...b, status: 'cancelled' } : b))
    setNotice(`$${((data.creditCents || 0) / 100).toFixed(2)} added to your account as studio credit — it applies automatically next time you book.`)
    setRescheduling(null)
  }

  const cancel = async (id: string) => {
    const msg = isPlus
      ? 'Cancel this booking?\n\nAs a Plus member, its full value comes back as studio credit — it never expires and applies automatically to your next booking.'
      : 'Cancel this booking? Refunds are only issued if cancelled 48+ hours in advance.'
    if (!confirm(msg)) return
    setCancelling(id); setError(''); setNotice('')
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
      if (isPlus && data.creditCents > 0) {
        setNotice(`$${((data.creditCents || 0) / 100).toFixed(2)} added to your account as studio credit — it applies automatically next time you book.`)
      }
      setCancelling(null)
    }
  }

  // Who is offered "save with Plus": a non-member, an individual set (never a
  // buyout — see SaveWithPlusModal), inside 48 hours and not yet started. That is
  // exactly the case the cancel route refuses for standard and allows for Plus.
  const saveEligible = (b: Booking) => {
    if (isPlus || b.status === 'cancelled' || !b.set_id) return false
    const h = (new Date(b.start_time).getTime() - Date.now()) / 3_600_000
    return h > 0 && h <= 48
  }

  const now = new Date()
  const upcoming = bookings.filter(b => new Date(b.start_time) > now && b.status !== 'cancelled')
  const past     = bookings.filter(b => new Date(b.start_time) <= now || b.status === 'cancelled')

  const Card = ({ b }: { b: Booking }) => {
    const isUpcoming = new Date(b.start_time) > now && b.status !== 'cancelled'
    const isCancelled = b.status === 'cancelled'
    const hoursUntil = (new Date(b.start_time).getTime() - now.getTime()) / (1000 * 60 * 60)
    const canReschedule = isUpcoming && hoursUntil > 48
    const canCancel = isUpcoming && (isPlus || hoursUntil > 48)
    // Moving a booking in place. Plus carries it inside 48h, matching the
    // cancellation policy. ⚠️ Acuity-sourced bookings are excluded here as well
    // as server-side — they're held in Acuity too, so moving one on our side
    // would leave the old slot blocked there and the new one double-bookable.
    const canMove = isUpcoming && !b.acuity_appointment_id && !!b.sets?.slug
      && (isPlus || hoursUntil > 48)

    return (
      <div style={{ background: 'var(--t-surface)', border: '1px solid rgba(var(--t-fg-rgb), 0.08)', borderRadius: 8, padding: '20px 24px', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 20, letterSpacing: '0.03em', marginBottom: 4 }}>
              {b.sets?.name ?? 'Studio'}
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(var(--t-fg-rgb), 0.5)', marginBottom: 2 }}>
              {fmt(b.start_time)}
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(var(--t-fg-rgb), 0.5)' }}>
              {b.total_price != null ? `$${b.total_price.toFixed(2)}` : ''}
            </div>
            {(b.booking_add_ons?.length ?? 0) > 0 && (
              <div style={{ marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(var(--t-fg-rgb), 0.06)' }}>
                <div style={{ fontFamily: 'Inter', fontSize: 10, letterSpacing: '0.12em', color: 'rgba(var(--t-fg-rgb), 0.3)', marginBottom: 4 }}>GEAR</div>
                {b.booking_add_ons!.map((a, i) => (
                  <div key={i} style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(var(--t-fg-rgb), 0.55)' }}>
                    {a.equipment?.name ?? 'Item'}{a.quantity > 1 ? ` × ${a.quantity}` : ''}
                    {a.paid === false && <span style={{ color: 'var(--t-gold)', marginLeft: 6 }}>· payment pending</span>}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 8 }}>
            <span style={{
              fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.08em', fontWeight: 600,
              padding: '4px 10px', borderRadius: 20,
              background: isCancelled ? 'rgba(255,60,60,0.1)' : isUpcoming ? 'rgba(60,255,120,0.1)' : 'rgba(var(--t-fg-rgb), 0.05)',
              color: isCancelled ? 'var(--t-err)' : isUpcoming ? 'var(--t-ok)' : 'rgba(var(--t-fg-rgb), 0.35)',
            }}>
              {b.status?.toUpperCase()}
            </span>
            {canMove && (
              <button
                onClick={() => setMoving(b)}
                title="Pick a new time — same set, same length, same price"
                style={{ background: 'var(--t-fg)', border: 'none', borderRadius: 4, padding: '6px 14px', fontFamily: 'Inter', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--t-on-fg)', cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                RESCHEDULE
              </button>
            )}
            {canReschedule && (
              <button
                onClick={() => rescheduleCredit(b.id)}
                disabled={rescheduling === b.id || cancelling === b.id}
                title="Don’t know the new date yet? Release this session and bank its full value as credit — it never expires and applies automatically when you rebook"
                style={{ background: 'linear-gradient(135deg, rgba(var(--t-gold-rgb), 0.16), rgba(var(--t-gold-rgb), 0.05))', border: '1px solid rgba(var(--t-gold-rgb), 0.4)', borderRadius: 4, padding: '6px 14px', fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.08em', color: 'var(--t-gold)', cursor: 'pointer', opacity: rescheduling === b.id ? 0.5 : 1, whiteSpace: 'nowrap' }}
              >
                {rescheduling === b.id ? 'BANKING…' : 'RELEASE → CREDIT'}
              </button>
            )}
            {canCancel && (
              <button
                onClick={() => cancel(b.id)}
                disabled={cancelling === b.id || rescheduling === b.id}
                style={{ background: 'none', border: '1px solid rgba(255,60,60,0.3)', borderRadius: 4, padding: '6px 14px', fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.08em', color: 'var(--t-err)', cursor: 'pointer', opacity: cancelling === b.id ? 0.5 : 1 }}
              >
                {cancelling === b.id ? 'CANCELLING...' : 'CANCEL'}
              </button>
            )}
            {isUpcoming && !canCancel && !canReschedule && !canMove && !isCancelled && saveEligible(b) && (
              <>
                <button
                  onClick={() => setSaving(b)}
                  title="Join Plus to move or cancel this booking inside 48 hours"
                  style={{ background: 'var(--t-gold)', border: 'none', borderRadius: 4, padding: '6px 14px', fontFamily: 'Inter', fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'var(--t-on-fg)', cursor: 'pointer', whiteSpace: 'nowrap' }}
                >
                  SAVE WITH PLUS
                </button>
                <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(var(--t-fg-rgb), 0.35)', textAlign: 'right', lineHeight: 1.5, maxWidth: 190 }}>
                  Plans changed? Plus members can move or cancel inside 48 hours.
                </span>
              </>
            )}
            {isUpcoming && !canCancel && !canReschedule && !canMove && !isCancelled && !saveEligible(b) && (
              <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(var(--t-fg-rgb), 0.3)', textAlign: 'right', lineHeight: 1.5, maxWidth: 180 }}>
                Inside 48 hours — text (832) 408-1631 and we’ll change it for you.
              </span>
            )}
            {isUpcoming && !isCancelled && (
              <a href={googleCalUrl({ title: `Made Kulture — ${b.sets?.name ?? 'Studio'}`, startISO: b.start_time, endISO: b.end_time, location: STUDIO_ADDRESS, details: 'Your Made Kulture session.' })}
                target="_blank" rel="noopener noreferrer"
                style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.06em', color: 'rgba(var(--t-fg-rgb), 0.55)', textDecoration: 'none', border: '1px solid rgba(var(--t-fg-rgb), 0.15)', borderRadius: 4, padding: '6px 12px', whiteSpace: 'nowrap' }}>
                + CALENDAR
              </a>
            )}
            {isUpcoming && gearCart.length > 0 && (
              <button
                onClick={() => addGear(b.id)}
                disabled={addingTo === b.id}
                style={{ background: 'var(--t-fg)', border: 'none', borderRadius: 4, padding: '6px 14px', fontFamily: 'Inter', fontSize: 11, fontWeight: 600, letterSpacing: '0.08em', color: 'var(--t-on-fg)', cursor: 'pointer', opacity: addingTo === b.id ? 0.5 : 1 }}
              >
                {addingTo === b.id ? 'ADDING…' : `+ ADD GEAR ($${cartTotal})`}
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  const MoveModal = moving ? (
    <RescheduleModal
      booking={{
        id: moving.id, start_time: moving.start_time, end_time: moving.end_time,
        setName: moving.sets?.name ?? 'Your session', setSlug: moving.sets?.slug ?? null,
      }}
      isPlus={isPlus}
      onClose={() => setMoving(null)}
      onDone={async (msg) => { setMoving(null); setNotice(msg); await refetch() }}
    />
  ) : null

  const SaveModal = saving ? (
    <SaveWithPlusModal
      booking={{
        setName: saving.sets?.name ?? 'Your session',
        when: fmt(saving.start_time),
        totalDollars: saving.total_price ?? null,
        canMove: !saving.acuity_appointment_id && !!saving.sets?.slug,
      }}
      onClose={() => setSaving(null)}
      onDone={() => {
        const name = saving.sets?.name ?? 'your'
        setSaving(null)
        setIsPlus(true)
        setNotice(`You’re a Plus member. Your ${name} booking can now be ${!saving.acuity_appointment_id && saving.sets?.slug ? 'rescheduled or ' : ''}cancelled for full studio credit — choose below before the session starts.`)
        refetch()
      }}
    />
  ) : null

  if (loading) return <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(var(--t-fg-rgb), 0.4)', paddingTop: 40 }}>Loading bookings...</div>

  return (
    <div>
      {MoveModal}
      {SaveModal}
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, margin: '0 0 8px' }}>MY BOOKINGS</h1>
      <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(var(--t-fg-rgb), 0.35)', marginBottom: 32 }}>
        Cancel 48+ hours before your session and the full value comes back as studio credit. Full-warehouse bookings cancelled inside 48 hours carry a 25% late cancellation fee.
      </p>

      {error && (
        <div style={{ background: 'rgba(255,60,60,0.1)', border: '1px solid rgba(255,60,60,0.2)', borderRadius: 4, padding: '12px 16px', fontFamily: 'Inter', fontSize: 13, color: 'var(--t-err)', marginBottom: 16 }}>
          {error}
        </div>
      )}

      {notice && (
        <div style={{ background: 'linear-gradient(135deg, rgba(var(--t-gold-rgb), 0.14), rgba(var(--t-gold-rgb), 0.04))', border: '1px solid rgba(var(--t-gold-rgb), 0.35)', borderRadius: 4, padding: '12px 16px', fontFamily: 'Inter', fontSize: 13, color: 'var(--t-gold)', marginBottom: 16 }}>
          {notice}
        </div>
      )}

      {gearCart.length > 0 && (
        <div style={{ background: 'rgba(var(--t-gold-rgb), 0.1)', border: '1px solid rgba(var(--t-gold-rgb), 0.3)', borderRadius: 4, padding: '14px 18px', fontFamily: 'Inter', fontSize: 13, color: 'var(--t-gold)', marginBottom: 20 }}>
          You have {gearCart.reduce((s, l) => s + l.quantity, 0)} gear item(s) in your cart (${cartTotal}). Pick an upcoming booking below and tap <strong>+ Add Gear</strong> — you&apos;ll get a payment link to confirm.
        </div>
      )}

      {upcoming.length === 0 && past.length === 0 && (
        <div style={{ textAlign: 'center', paddingTop: 60 }}>
          <div style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(var(--t-fg-rgb), 0.35)', marginBottom: 20 }}>No bookings yet</div>
          <Link href="/availability" style={{ background: 'var(--t-fg)', color: 'var(--t-on-fg)', borderRadius: 4, padding: '12px 24px', fontFamily: 'Inter', fontSize: 13, fontWeight: 600, letterSpacing: '0.1em', textDecoration: 'none' }}>
            BOOK A SET
          </Link>
        </div>
      )}

      {upcoming.length > 0 && (
        <div style={{ marginBottom: 40 }}>
          <h2 style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.1em', color: 'rgba(var(--t-fg-rgb), 0.3)', margin: '0 0 12px' }}>UPCOMING</h2>
          {upcoming.map(b => <Card key={b.id} b={b} />)}
        </div>
      )}

      {past.length > 0 && (
        <div>
          <h2 style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.1em', color: 'rgba(var(--t-fg-rgb), 0.3)', margin: '0 0 12px' }}>PAST & CANCELLED</h2>
          {past.map(b => <Card key={b.id} b={b} />)}
        </div>
      )}
    </div>
  )
}
