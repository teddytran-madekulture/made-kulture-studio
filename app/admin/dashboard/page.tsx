'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ──────────────────────────────────────────────────────────────────────

interface Booking {
  id: string
  start_time: string
  end_time: string
  status: 'confirmed' | 'cancelled' | 'completed'
  total_amount: number
  notes: string | null
  source: string
  created_at: string
  square_payment_id: string | null
  sets: { name: string } | null
  customers: { name: string; email: string; phone: string } | null
  booking_addons?: { equipment_name: string; price: number }[]
}

interface CustomerResult {
  id: string
  name: string
  email: string
  phone: string
  squareCustomerId: string | null
  squareCardId: string | null
  hasCardOnFile: boolean
}

interface SquareCard {
  id: string
  brand: string
  last4: string
  expMonth: number
  expYear: number
}

// ── Constants ──────────────────────────────────────────────────────────────────

const SETS = [
  { id: 'set-a', name: 'Set A' }, { id: 'set-b', name: 'Set B' },
  { id: 'set-c', name: 'Set C' }, { id: 'set-d', name: 'Set D' },
  { id: 'concrete', name: 'Concrete' }, { id: 'vintage', name: 'Vintage' },
  { id: 'cottage', name: 'Cottage' }, { id: 'watering-hole', name: 'The Watering Hole' },
  { id: 'the-tank', name: 'The Tank' },
  { id: 'studio-one', name: 'Studio One' }, { id: 'studio', name: 'Full Studio Takeover' },
]

const CAL_SETS   = ['Set A', 'Set B', 'Set C', 'Set D', 'Concrete', 'Vintage', 'Cottage', 'The Watering Hole', 'The Tank', 'Studio One']
const SLOT_H     = 44    // px per 30-min slot → 88px/hr
const CAL_START  = 9
const CAL_END    = 22
const SLOTS_N    = (CAL_END - CAL_START) * 2  // 26
const TIME_COL   = 64   // px
const SET_COL    = 134  // px per set column

const HOURS = Array.from({ length: 14 }, (_, i) => i + 9)

// ── Helpers ────────────────────────────────────────────────────────────────────

function localHour(iso: string): number {
  const t = new Date(iso).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Chicago',
  })
  const [h, m] = t.split(':').map(Number)
  return h + m / 60
}

function localDateStr(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
}

function todayStr(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
}

function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + 'T12:00:00')
  d.setDate(d.getDate() + n)
  return d.toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })
}

function fmtCalHeader(dateStr: string): string {
  const d = new Date(dateStr + 'T12:00:00')
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

function fmt12(h: number) {
  const hour = Math.floor(h)
  const mins = h % 1 !== 0 ? '30' : '00'
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12  = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:${mins} ${ampm}`
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago',
  })
}

function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'America/Chicago',
  })
}

function fmtDuration(startIso: string, endIso: string): string {
  const h = localHour(endIso) - localHour(startIso)
  return h === Math.floor(h) ? `${h} hr${h !== 1 ? 's' : ''}` : `${h} hrs`
}

function tomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

function cardLabel(c: SquareCard) {
  return `${c.brand?.replace('_', ' ')} **** ${c.last4}  (exp ${c.expMonth}/${c.expYear})`
}

function getNowHour(): number {
  const t = new Date().toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Chicago',
  })
  const [h, m] = t.split(':').map(Number)
  return h + m / 60
}

// ── Style atoms ────────────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: 'transparent',
  border: '1px solid rgba(255,255,255,0.15)',
  color: '#fff',
  padding: '10px 14px',
  fontSize: 13,
  fontFamily: 'Inter, sans-serif',
  outline: 'none',
  width: '100%',
}

const labelStyle: React.CSSProperties = {
  fontFamily: 'Inter, sans-serif',
  fontSize: 10,
  fontWeight: 500,
  letterSpacing: '0.15em',
  color: 'rgba(255,255,255,0.35)',
  marginBottom: 8,
  display: 'block',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

function Detail({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.35)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontFamily: mono ? 'monospace' : 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.85)', wordBreak: 'break-all' }}>{value}</div>
    </div>
  )
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function AdminDashboard() {
  const router = useRouter()

  const [bookings,  setBookings]  = useState<Booking[]>([])
  const [loading,   setLoading]   = useState(true)
  const [tab,       setTab]       = useState<'upcoming' | 'past' | 'all'>('upcoming')
  const [expanded,  setExpanded]  = useState<string | null>(null)
  const [cancelling,setCancelling]= useState<string | null>(null)
  const [showManual,setShowManual]= useState(false)

  // View / calendar
  const [view,          setView]          = useState<'list' | 'calendar'>('list')
  const [calDate,       setCalDate]       = useState(todayStr)
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null)
  const [nowHour,       setNowHour]       = useState(getNowHour)

  // Customer search
  const [searchQuery,    setSearchQuery]    = useState('')
  const [searchResults,  setSearchResults]  = useState<CustomerResult[]>([])
  const [searching,      setSearching]      = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerResult | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [cards,       setCards]       = useState<SquareCard[]>([])
  const [loadingCards,setLoadingCards]= useState(false)
  const [selectedCard,setSelectedCard]= useState<SquareCard | null>(null)
  const [chargeMode,  setChargeMode]  = useState<'card-on-file' | 'log-only'>('log-only')

  const [manual, setManual] = useState({
    setSlug: 'set-a', date: tomorrow(), startHour: 10, endHour: 12,
    name: '', email: '', phone: '', notes: '', totalAmount: 0, sendSms: true,
  })
  const [submitting,   setSubmitting]   = useState(false)
  const [submitError,  setSubmitError]  = useState('')
  const [submitSuccess,setSubmitSuccess]= useState(false)

  // Update current time line every minute
  useEffect(() => {
    const id = setInterval(() => setNowHour(getNowHour()), 60_000)
    return () => clearInterval(id)
  }, [])

  const fetchBookings = useCallback(async () => {
    setLoading(true)
    const res = await fetch('/api/admin/bookings')
    if (res.status === 401) { router.push('/admin'); return }
    const data = await res.json()
    setBookings(data.bookings || [])
    setLoading(false)
  }, [router])

  useEffect(() => { fetchBookings() }, [fetchBookings])

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current)
    if (searchQuery.length < 2) { setSearchResults([]); return }
    setSearching(true)
    searchTimer.current = setTimeout(async () => {
      const res  = await fetch(`/api/admin/customers?q=${encodeURIComponent(searchQuery)}`)
      const data = await res.json()
      setSearchResults(data.customers || [])
      setSearching(false)
    }, 300)
  }, [searchQuery])

  const selectCustomer = async (c: CustomerResult) => {
    setSelectedCustomer(c)
    setSearchQuery(c.name)
    setSearchResults([])
    setManual(m => ({ ...m, name: c.name, email: c.email, phone: c.phone }))
    if (c.hasCardOnFile && c.squareCustomerId) {
      setLoadingCards(true)
      setChargeMode('card-on-file')
      const res  = await fetch(`/api/admin/square-cards?customerId=${c.squareCustomerId}`)
      const data = await res.json()
      const list: SquareCard[] = data.cards || []
      setCards(list)
      setSelectedCard(list[0] ?? null)
      setLoadingCards(false)
    } else {
      setCards([]); setSelectedCard(null); setChargeMode('log-only')
    }
  }

  const clearCustomer = () => {
    setSelectedCustomer(null); setSearchQuery(''); setSearchResults([])
    setCards([]); setSelectedCard(null); setChargeMode('log-only')
    setManual(m => ({ ...m, name: '', email: '', phone: '' }))
  }

  const resetModal = () => {
    clearCustomer()
    setManual({ setSlug: 'set-a', date: tomorrow(), startHour: 10, endHour: 12, name: '', email: '', phone: '', notes: '', totalAmount: 0, sendSms: true })
    setSubmitError(''); setSubmitSuccess(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault(); setSubmitting(true); setSubmitError('')
    const endpoint = (chargeMode === 'card-on-file' && selectedCard) ? '/api/admin/charge' : '/api/admin/bookings'
    const body = chargeMode === 'card-on-file' && selectedCard
      ? { squareCardId: selectedCard.id, squareCustomerId: selectedCustomer?.squareCustomerId, ...manual }
      : manual
    const res  = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await res.json()
    if (!res.ok) { setSubmitError(data.error || 'Failed'); setSubmitting(false); return }
    setSubmitSuccess(true)
    setTimeout(() => { setSubmitSuccess(false); setShowManual(false); resetModal(); fetchBookings() }, 1500)
  }

  const handleLogout = async () => {
    await fetch('/api/admin/auth', { method: 'DELETE' })
    router.push('/admin')
  }

  const handleCancel = async (id: string) => {
    if (!confirm('Cancel this booking?')) return
    setCancelling(id)
    await fetch(`/api/admin/bookings/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    })
    setCancelling(null)
    fetchBookings()
    if (detailBooking?.id === id) setDetailBooking(null)
  }

  const closeModal = () => { setShowManual(false); resetModal() }
  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) closeModal()
  }

  // ── Derived ──────────────────────────────────────────────────────────────────

  const now        = new Date()
  const upcoming   = bookings.filter(b => new Date(b.start_time) >= now && b.status !== 'cancelled')
  const past       = bookings.filter(b => new Date(b.start_time) < now  || b.status === 'cancelled')
  const displayed  = tab === 'upcoming' ? upcoming : tab === 'past' ? past : bookings
  const confirmed  = bookings.filter(b => b.status === 'confirmed')
  const thisMonth  = confirmed.filter(b => {
    const d = new Date(b.start_time)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const revenueTotal      = confirmed.reduce((s, b) => s + (b.total_amount || 0), 0)
  const revenueThisMonth  = thisMonth.reduce((s, b)  => s + (b.total_amount || 0), 0)

  const submitLabel = submitSuccess ? 'BOOKING ADDED'
    : submitting ? 'PROCESSING...'
    : chargeMode === 'card-on-file' && selectedCard
      ? `CHARGE ${selectedCard.brand?.replace('_', ' ')} **** ${selectedCard.last4}`
      : 'ADD BOOKING'

  // Calendar
  const isToday     = calDate === todayStr()
  const dayBookings = bookings.filter(b => b.status !== 'cancelled' && localDateStr(b.start_time) === calDate)
  const nowTop      = (nowHour - CAL_START) * SLOT_H * 2

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#fff', fontFamily: 'Inter, sans-serif' }}>

      {/* NAV */}
      <div style={{
        borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '20px 40px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        position: 'sticky', top: 0, background: '#080808', zIndex: 50,
      }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.05em' }}>
          MADE KULTURE <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 16 }}>/ ADMIN</span>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
          {/* View toggle */}
          <div style={{ display: 'flex', border: '1px solid rgba(255,255,255,0.15)', overflow: 'hidden' }}>
            {(['list', 'calendar'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{
                background: view === v ? '#fff' : 'transparent', border: 'none',
                padding: '8px 18px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                fontSize: 11, fontWeight: 500, letterSpacing: '0.15em',
                color: view === v ? '#080808' : 'rgba(255,255,255,0.4)',
              }}>
                {v === 'list' ? '≡ LIST' : '⊡ CALENDAR'}
              </button>
            ))}
          </div>
          <button onClick={() => { resetModal(); setShowManual(true) }}
            style={{ background: '#fff', border: 'none', padding: '10px 20px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: '#080808' }}>
            + MANUAL BOOKING
          </button>
          <button onClick={handleLogout}
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', padding: '10px 20px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.4)' }}>
            LOG OUT
          </button>
        </div>
      </div>

      <div style={{ maxWidth: view === 'calendar' ? '100%' : 1200, margin: '0 auto', padding: '40px 40px 0' }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'rgba(255,255,255,0.05)', marginBottom: 40 }}>
          {[
            { label: 'ALL-TIME REVENUE', value: `$${revenueTotal.toLocaleString()}` },
            { label: 'THIS MONTH',       value: `$${revenueThisMonth.toLocaleString()}` },
            { label: 'TOTAL BOOKINGS',   value: confirmed.length.toString() },
            { label: 'UPCOMING',         value: upcoming.length.toString() },
          ].map(s => (
            <div key={s.label} style={{ background: '#0d0d0d', padding: '24px 28px' }}>
              <div style={{ ...labelStyle, marginBottom: 10 }}>{s.label}</div>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, color: '#fff', letterSpacing: '0.02em' }}>{s.value}</div>
            </div>
          ))}
        </div>

        {/* ── LIST VIEW ─────────────────────────────────────────────────────── */}
        {view === 'list' && (
          <>
            <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 32 }}>
              {(['upcoming', 'past', 'all'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} style={{
                  background: 'transparent', border: 'none',
                  borderBottom: tab === t ? '2px solid #fff' : '2px solid transparent',
                  padding: '12px 24px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                  fontSize: 11, fontWeight: 500, letterSpacing: '0.15em',
                  color: tab === t ? '#fff' : 'rgba(255,255,255,0.35)', marginBottom: -1,
                }}>
                  {t.toUpperCase()} ({t === 'upcoming' ? upcoming.length : t === 'past' ? past.length : bookings.length})
                </button>
              ))}
            </div>

            {loading ? (
              <div style={{ ...labelStyle, textAlign: 'center', padding: 60 }}>LOADING...</div>
            ) : displayed.length === 0 ? (
              <div style={{ ...labelStyle, textAlign: 'center', padding: 60 }}>NO BOOKINGS</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1, paddingBottom: 60 }}>
                {displayed.map(b => {
                  const isOpen      = expanded === b.id
                  const isCancelled = b.status === 'cancelled'
                  return (
                    <div key={b.id} style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.06)' }}>
                      <div onClick={() => setExpanded(isOpen ? null : b.id)}
                        style={{ padding: '20px 24px', cursor: 'pointer', display: 'grid', gridTemplateColumns: '2fr 1.5fr 1fr 1fr 100px', alignItems: 'center', gap: 16, opacity: isCancelled ? 0.4 : 1 }}>
                        <div>
                          <div style={{ fontSize: 14, color: '#fff', fontWeight: 500, marginBottom: 4 }}>{b.customers?.name || '—'}</div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{b.customers?.email}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 13, color: '#fff', marginBottom: 4 }}>{b.sets?.name || 'Full Studio Takeover'}</div>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{fmtDate(b.start_time)}</div>
                        </div>
                        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)' }}>
                          {fmtTime(b.start_time)} – {fmtTime(b.end_time)}
                        </div>
                        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, color: '#fff' }}>
                          ${b.total_amount?.toLocaleString()}
                        </div>
                        <div style={{
                          fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', textAlign: 'center', padding: '4px 10px',
                          color: isCancelled ? '#ff6b6b' : b.status === 'confirmed' ? '#4ade80' : 'rgba(255,255,255,0.4)',
                          border: `1px solid ${isCancelled ? 'rgba(255,100,100,0.3)' : b.status === 'confirmed' ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.1)'}`,
                        }}>
                          {b.status.toUpperCase()}
                        </div>
                      </div>
                      {isOpen && (
                        <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', padding: '20px 24px', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32 }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            <Detail label="PHONE"  value={b.customers?.phone || '—'} />
                            <Detail label="SOURCE" value={b.source || '—'} />
                            {b.notes && <Detail label="NOTES" value={b.notes} />}
                            {b.square_payment_id && <Detail label="SQUARE PAYMENT ID" value={b.square_payment_id} mono />}
                            {b.booking_addons?.length > 0 && (
                              <div>
                                <div style={labelStyle}>EQUIPMENT</div>
                                {b.booking_addons.map((a, i) => (
                                  <div key={i} style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 2 }}>
                                    {a.equipment_name} — ${a.price}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end' }}>
                            {!isCancelled && (
                              <button onClick={() => handleCancel(b.id)} disabled={cancelling === b.id}
                                style={{ background: 'transparent', border: '1px solid rgba(255,100,100,0.4)', padding: '10px 20px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.12em', color: '#ff6b6b' }}>
                                {cancelling === b.id ? 'CANCELLING...' : 'CANCEL BOOKING'}
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </>
        )}

        {/* ── CALENDAR VIEW ─────────────────────────────────────────────────── */}
        {view === 'calendar' && (
          <div style={{ paddingBottom: 40 }}>

            {/* Date nav */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
              <button onClick={() => setCalDate(d => addDays(d, -1))}
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '8px 14px', cursor: 'pointer', fontSize: 14 }}>
                ←
              </button>
              <button onClick={() => setCalDate(todayStr())}
                style={{ background: isToday ? '#fff' : 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: isToday ? '#080808' : '#fff', padding: '8px 16px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.12em', fontWeight: 500 }}>
                TODAY
              </button>
              <input type="date" value={calDate} onChange={e => setCalDate(e.target.value)}
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '8px 12px', fontSize: 13, fontFamily: 'Inter, sans-serif', cursor: 'pointer', outline: 'none', colorScheme: 'dark' }} />
              <button onClick={() => setCalDate(d => addDays(d, 1))}
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '8px 14px', cursor: 'pointer', fontSize: 14 }}>
                →
              </button>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.05em' }}>
                {fmtCalHeader(calDate)}
              </div>
              <div style={{ marginLeft: 'auto', fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em' }}>
                {dayBookings.length} BOOKING{dayBookings.length !== 1 ? 'S' : ''}
              </div>
            </div>

            {/* Grid */}
            <div style={{ overflowX: 'auto', overflowY: 'auto', maxHeight: 'calc(100vh - 300px)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 2 }}>
              <div style={{ minWidth: TIME_COL + CAL_SETS.length * SET_COL }}>

                {/* Sticky header row */}
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `${TIME_COL}px repeat(${CAL_SETS.length}, ${SET_COL}px)`,
                  position: 'sticky', top: 0, background: '#111', zIndex: 10,
                  borderBottom: '1px solid rgba(255,255,255,0.1)',
                }}>
                  <div style={{ padding: '10px 8px' }} />
                  {CAL_SETS.map(s => (
                    <div key={s} style={{
                      padding: '10px 8px', fontFamily: 'Inter, sans-serif', fontSize: 10,
                      fontWeight: 500, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)',
                      borderLeft: '1px solid rgba(255,255,255,0.06)', textAlign: 'center',
                    }}>
                      {s.toUpperCase()}
                    </div>
                  ))}
                </div>

                {/* Body */}
                <div style={{ position: 'relative', height: SLOTS_N * SLOT_H }}>

                  {/* Grid lines + time labels */}
                  {Array.from({ length: SLOTS_N }, (_, i) => i).map(i => {
                    const h      = CAL_START + i * 0.5
                    const isHour = i % 2 === 0
                    return (
                      <div key={i} style={{ position: 'absolute', top: i * SLOT_H, left: 0, right: 0, display: 'flex', pointerEvents: 'none' }}>
                        <div style={{ width: TIME_COL, flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', paddingRight: 10 }}>
                          {isHour && (
                            <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: 'rgba(255,255,255,0.25)', transform: 'translateY(-6px)', whiteSpace: 'nowrap' }}>
                              {fmt12(h)}
                            </span>
                          )}
                        </div>
                        <div style={{ flex: 1, borderTop: isHour ? '1px solid rgba(255,255,255,0.08)' : '1px dashed rgba(255,255,255,0.03)' }} />
                      </div>
                    )
                  })}

                  {/* Vertical column dividers */}
                  {CAL_SETS.map((_, i) => (
                    <div key={i} style={{
                      position: 'absolute', top: 0, bottom: 0,
                      left: TIME_COL + i * SET_COL, width: 1,
                      background: 'rgba(255,255,255,0.06)', pointerEvents: 'none',
                    }} />
                  ))}

                  {/* Current time line */}
                  {isToday && nowHour >= CAL_START && nowHour <= CAL_END && (
                    <div style={{
                      position: 'absolute', top: nowTop, left: TIME_COL, right: 0,
                      height: 2, background: '#ef4444', zIndex: 5, pointerEvents: 'none',
                    }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', position: 'absolute', left: -4, top: -3 }} />
                    </div>
                  )}

                  {/* Full-studio buyout banners (span all columns) */}
                  {dayBookings.filter(b => b.sets === null).map(b => {
                    const startH = Math.max(localHour(b.start_time), CAL_START)
                    const endH   = Math.min(localHour(b.end_time), CAL_END)
                    const top    = (startH - CAL_START) * SLOT_H * 2
                    const height = Math.max((endH - startH) * SLOT_H * 2, SLOT_H)
                    const sel    = detailBooking?.id === b.id
                    return (
                      <div key={b.id} onClick={() => setDetailBooking(sel ? null : b)}
                        style={{
                          position: 'absolute', top: top + 1, height: height - 2,
                          left: TIME_COL + 2, right: 2,
                          background: 'rgba(234,179,8,0.12)',
                          border: `1px solid ${sel ? '#fbbf24' : 'rgba(234,179,8,0.35)'}`,
                          cursor: 'pointer', borderRadius: 2,
                          padding: '6px 12px', zIndex: 4,
                          display: 'flex', alignItems: 'center', gap: 12,
                        }}>
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, color: '#fbbf24', letterSpacing: '0.08em' }}>FULL STUDIO BUYOUT</span>
                        <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(251,191,36,0.7)' }}>{b.customers?.name} · {fmtTime(b.start_time)}–{fmtTime(b.end_time)}</span>
                      </div>
                    )
                  })}

                  {/* Per-set booking blocks */}
                  {CAL_SETS.map((setName, colIdx) => {
                    const colBookings = dayBookings.filter(b => b.sets?.name === setName)
                    return colBookings.map(b => {
                      const startH  = Math.max(localHour(b.start_time), CAL_START)
                      const endH    = Math.min(localHour(b.end_time), CAL_END)
                      const top     = (startH - CAL_START) * SLOT_H * 2
                      const height  = Math.max((endH - startH) * SLOT_H * 2, SLOT_H)
                      const sel     = detailBooking?.id === b.id
                      return (
                        <div key={b.id} onClick={() => setDetailBooking(sel ? null : b)}
                          style={{
                            position: 'absolute',
                            top: top + 2, height: height - 4,
                            left: TIME_COL + colIdx * SET_COL + 3,
                            width: SET_COL - 6,
                            background: sel ? '#a3e635' : '#4ade80',
                            cursor: 'pointer', borderRadius: 2,
                            padding: '5px 8px', overflow: 'hidden', zIndex: 3,
                            boxShadow: sel ? '0 0 0 2px #fff' : 'none',
                            transition: 'background 0.1s',
                          }}>
                          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, color: '#052e16', lineHeight: 1.3, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>
                            {b.customers?.name || '—'}
                          </div>
                          <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: 'rgba(5,46,22,0.7)', marginTop: 2 }}>
                            {fmtTime(b.start_time)}–{fmtTime(b.end_time)}
                          </div>
                          {height > 72 && b.total_amount > 0 && (
                            <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, color: 'rgba(5,46,22,0.6)', marginTop: 2 }}>
                              ${b.total_amount}
                            </div>
                          )}
                        </div>
                      )
                    })
                  })}

                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── BOOKING DETAIL PANEL ──────────────────────────────────────────────── */}
      {detailBooking && (
        <>
          <div onClick={() => setDetailBooking(null)} style={{ position: 'fixed', inset: 0, zIndex: 49 }} />
          <div style={{
            position: 'fixed', right: 0, top: 0, bottom: 0, width: 380,
            background: '#111', borderLeft: '1px solid rgba(255,255,255,0.1)',
            zIndex: 60, overflowY: 'auto', boxShadow: '-8px 0 40px rgba(0,0,0,0.6)',
          }}>
            <div style={{ padding: 28 }}>

              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
                <div>
                  <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, letterSpacing: '0.05em', lineHeight: 1 }}>
                    {detailBooking.customers?.name || '—'}
                  </div>
                  <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 6 }}>
                    {detailBooking.sets?.name || 'Full Studio Takeover'}
                  </div>
                </div>
                <button onClick={() => setDetailBooking(null)}
                  style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 22, lineHeight: 1, padding: 4 }}>
                  ×
                </button>
              </div>

              {/* Status */}
              <div style={{ marginBottom: 24 }}>
                <span style={{
                  fontSize: 10, fontWeight: 500, letterSpacing: '0.12em', padding: '4px 12px',
                  color: detailBooking.status === 'cancelled' ? '#ff6b6b' : detailBooking.status === 'confirmed' ? '#4ade80' : 'rgba(255,255,255,0.4)',
                  border: `1px solid ${detailBooking.status === 'cancelled' ? 'rgba(255,100,100,0.3)' : detailBooking.status === 'confirmed' ? 'rgba(74,222,128,0.3)' : 'rgba(255,255,255,0.1)'}`,
                }}>
                  {detailBooking.status.toUpperCase()}
                </span>
              </div>

              {/* Details grid */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 20 }}>
                <Detail label="DATE"     value={fmtDate(detailBooking.start_time)} />
                <Detail label="TIME"     value={`${fmtTime(detailBooking.start_time)} – ${fmtTime(detailBooking.end_time)}`} />
                <Detail label="DURATION" value={fmtDuration(detailBooking.start_time, detailBooking.end_time)} />
                <Detail label="EMAIL"    value={detailBooking.customers?.email || '—'} />
                <Detail label="PHONE"    value={detailBooking.customers?.phone || '—'} />
                <Detail label="AMOUNT"   value={`$${(detailBooking.total_amount || 0).toLocaleString()}`} />
                <Detail label="SOURCE"   value={detailBooking.source || '—'} />
                {detailBooking.notes && <Detail label="NOTES" value={detailBooking.notes} />}
                {detailBooking.square_payment_id && (
                  <Detail label="SQUARE PAYMENT ID" value={detailBooking.square_payment_id} mono />
                )}
              </div>

              {/* Equipment */}
              {detailBooking.booking_addons?.length > 0 && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 20, paddingTop: 20 }}>
                  <div style={labelStyle}>EQUIPMENT</div>
                  {detailBooking.booking_addons.map((a, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.6)', marginBottom: 8 }}>
                      <span>{a.equipment_name}</span>
                      <span>${a.price}</span>
                    </div>
                  ))}
                </div>
              )}

              {/* Actions */}
              {detailBooking.status !== 'cancelled' && (
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', marginTop: 28, paddingTop: 24, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {detailBooking.customers?.phone && (
                    <a href={`sms:${detailBooking.customers.phone}`}
                      style={{ display: 'block', textAlign: 'center', padding: '12px', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', textDecoration: 'none', fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.12em' }}>
                      TEXT CUSTOMER ↗
                    </a>
                  )}
                  <button onClick={() => handleCancel(detailBooking.id)} disabled={cancelling === detailBooking.id}
                    style={{ background: 'transparent', border: '1px solid rgba(255,100,100,0.4)', padding: '12px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.12em', color: '#ff6b6b', width: '100%' }}>
                    {cancelling === detailBooking.id ? 'CANCELLING...' : 'CANCEL BOOKING'}
                  </button>
                </div>
              )}

            </div>
          </div>
        </>
      )}

      {/* ── MANUAL BOOKING MODAL ──────────────────────────────────────────────── */}
      {showManual && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }} onClick={handleBackdropClick}>
          <div style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.1)', padding: 40, width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, letterSpacing: '0.05em' }}>MANUAL BOOKING</div>
              <button onClick={closeModal} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 20 }}>×</button>
            </div>

            <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <label style={labelStyle}>SEARCH EXISTING CUSTOMER</label>
              <div style={{ position: 'relative' }}>
                <input value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); if (!e.target.value) clearCustomer() }}
                  placeholder="Name, email, or phone..."
                  style={{ ...inputStyle, paddingRight: selectedCustomer ? 36 : 14 }} />
                {selectedCustomer && (
                  <button onClick={clearCustomer} style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 16 }}>×</button>
                )}
                {searchResults.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)', zIndex: 50, maxHeight: 240, overflowY: 'auto' }}>
                    {searchResults.map(c => (
                      <div key={c.id} onClick={() => selectCustomer(c)}
                        style={{ padding: '12px 16px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.05)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'rgba(255,255,255,0.05)' }}
                        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent' }}>
                        <div style={{ fontSize: 13, color: '#fff', marginBottom: 3 }}>{c.name}</div>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{c.email}</span>
                          {c.hasCardOnFile && <span style={{ fontSize: 10, letterSpacing: '0.1em', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', padding: '1px 6px' }}>CARD ON FILE</span>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {searching && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.1)', padding: '12px 16px' }}>
                    <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em' }}>SEARCHING...</span>
                  </div>
                )}
              </div>

              {selectedCustomer?.hasCardOnFile && (
                <div style={{ marginTop: 16 }}>
                  {loadingCards ? (
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em' }}>LOADING CARDS...</div>
                  ) : cards.length > 0 ? (
                    <div>
                      <label style={{ ...labelStyle, marginBottom: 10 }}>CARD ON FILE</label>
                      {cards.map(card => (
                        <label key={card.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: `1px solid ${selectedCard?.id === card.id ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.1)'}`, marginBottom: 8, cursor: 'pointer' }}>
                          <input type="radio" name="card" checked={selectedCard?.id === card.id} onChange={() => setSelectedCard(card)} style={{ accentColor: '#fff' }} />
                          <span style={{ fontSize: 13, color: '#fff' }}>{cardLabel(card)}</span>
                        </label>
                      ))}
                      <div style={{ display: 'flex', gap: 20, marginTop: 12 }}>
                        {(['card-on-file', 'log-only'] as const).map(mode => (
                          <label key={mode} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                            <input type="radio" name="chargeMode" checked={chargeMode === mode} onChange={() => setChargeMode(mode)} style={{ accentColor: '#fff' }} />
                            <span style={{ fontSize: 12, color: chargeMode === mode ? '#fff' : 'rgba(255,255,255,0.4)' }}>
                              {mode === 'card-on-file' ? 'Charge card on file' : 'Log only (no charge)'}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', marginTop: 8 }}>No active cards found in Square.</div>
                  )}
                </div>
              )}
            </div>

            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <Field label="SET">
                <select value={manual.setSlug} onChange={e => setManual(m => ({ ...m, setSlug: e.target.value }))} style={inputStyle}>
                  {SETS.map(s => <option key={s.id} value={s.id} style={{ background: '#111' }}>{s.name}</option>)}
                </select>
              </Field>
              <Field label="DATE">
                <input type="date" value={manual.date} onChange={e => setManual(m => ({ ...m, date: e.target.value }))} style={inputStyle} required />
              </Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="START TIME">
                  <select value={manual.startHour} onChange={e => setManual(m => ({ ...m, startHour: Number(e.target.value) }))} style={inputStyle}>
                    {HOURS.slice(0, -1).map(h => <option key={h} value={h} style={{ background: '#111' }}>{fmt12(h)}</option>)}
                  </select>
                </Field>
                <Field label="END TIME">
                  <select value={manual.endHour} onChange={e => setManual(m => ({ ...m, endHour: Number(e.target.value) }))} style={inputStyle}>
                    {HOURS.filter(h => h > manual.startHour).map(h => (
                      <option key={h} value={h} style={{ background: '#111' }}>{fmt12(h)}</option>
                    ))}
                  </select>
                </Field>
              </div>
              <Field label="FULL NAME">
                <input value={manual.name} onChange={e => setManual(m => ({ ...m, name: e.target.value }))} placeholder="Jane Smith" style={inputStyle} required />
              </Field>
              <Field label="EMAIL">
                <input type="email" value={manual.email} onChange={e => setManual(m => ({ ...m, email: e.target.value }))} placeholder="jane@studio.com" style={inputStyle} required />
              </Field>
              <Field label="PHONE">
                <input value={manual.phone} onChange={e => setManual(m => ({ ...m, phone: e.target.value }))} placeholder="(832) 000-0000" style={inputStyle} />
              </Field>
              <Field label="TOTAL AMOUNT ($)">
                <input type="number" min="0" step="0.01" value={manual.totalAmount} onChange={e => setManual(m => ({ ...m, totalAmount: Number(e.target.value) }))} style={inputStyle} />
              </Field>
              <Field label="NOTES (OPTIONAL)">
                <textarea value={manual.notes} onChange={e => setManual(m => ({ ...m, notes: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
              </Field>
              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 4 }}>
                <input type="checkbox" checked={manual.sendSms} onChange={e => setManual(m => ({ ...m, sendSms: e.target.checked }))} style={{ accentColor: '#fff', width: 16, height: 16 }} />
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Send SMS confirmation to customer</span>
              </label>
              {submitError && <div style={{ fontSize: 12, color: '#ff6b6b', marginTop: 4 }}>{submitError}</div>}
              <button type="submit" disabled={submitting || submitSuccess}
                style={{
                  background: submitSuccess ? '#4ade80' : '#fff', border: 'none', padding: '14px', marginTop: 8,
                  cursor: submitting || submitSuccess ? 'default' : 'pointer',
                  fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', color: '#080808',
                }}>
                {submitLabel}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  )
}
