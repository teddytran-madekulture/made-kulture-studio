'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

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
  booking_addons: { equipment_name: string; price: number }[]
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

const SETS = [
  { id: 'set-a', name: 'Set A' }, { id: 'set-b', name: 'Set B' },
  { id: 'set-c', name: 'Set C' }, { id: 'set-d', name: 'Set D' },
  { id: 'concrete', name: 'Concrete' }, { id: 'vintage', name: 'Vintage' },
  { id: 'cottage', name: 'Cottage' }, { id: 'watering-hole', name: 'The Watering Hole' },
  { id: 'studio-one', name: 'Studio One' }, { id: 'studio', name: 'Full Studio Takeover' },
]

const HOURS = Array.from({ length: 14 }, (_, i) => i + 9)

function fmt12(h: number) {
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:00 ${ampm}`
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

function tomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return d.toISOString().split('T')[0]
}

function cardLabel(card: SquareCard) {
  return `${card.brand?.replace('_', ' ')} **** ${card.last4}  (exp ${card.expMonth}/${card.expYear})`
}

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
      <div style={{ fontFamily: mono ? 'monospace' : 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.7)', wordBreak: 'break-all' }}>{value}</div>
    </div>
  )
}

export default function AdminDashboard() {
  const router = useRouter()

  const [bookings, setBookings] = useState<Booking[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'upcoming' | 'past' | 'all'>('upcoming')
  const [expanded, setExpanded] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  const [showManual, setShowManual] = useState(false)

  const [searchQuery, setSearchQuery] = useState('')
  const [searchResults, setSearchResults] = useState<CustomerResult[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerResult | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [cards, setCards] = useState<SquareCard[]>([])
  const [loadingCards, setLoadingCards] = useState(false)
  const [selectedCard, setSelectedCard] = useState<SquareCard | null>(null)
  const [chargeMode, setChargeMode] = useState<'card-on-file' | 'log-only'>('log-only')

  const [manual, setManual] = useState({
    setSlug: 'set-a', date: tomorrow(), startHour: 10, endHour: 12,
    name: '', email: '', phone: '', notes: '', totalAmount: 0, sendSms: true,
  })
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [submitSuccess, setSubmitSuccess] = useState(false)

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
      const res = await fetch(`/api/admin/customers?q=${encodeURIComponent(searchQuery)}`)
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
      const res = await fetch(`/api/admin/square-cards?customerId=${c.squareCustomerId}`)
      const data = await res.json()
      const cardList: SquareCard[] = data.cards || []
      setCards(cardList)
      setSelectedCard(cardList[0] ?? null)
      setLoadingCards(false)
    } else {
      setCards([])
      setSelectedCard(null)
      setChargeMode('log-only')
    }
  }

  const clearCustomer = () => {
    setSelectedCustomer(null)
    setSearchQuery('')
    setSearchResults([])
    setCards([])
    setSelectedCard(null)
    setChargeMode('log-only')
    setManual(m => ({ ...m, name: '', email: '', phone: '' }))
  }

  const resetModal = () => {
    clearCustomer()
    setManual({ setSlug: 'set-a', date: tomorrow(), startHour: 10, endHour: 12, name: '', email: '', phone: '', notes: '', totalAmount: 0, sendSms: true })
    setSubmitError('')
    setSubmitSuccess(false)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setSubmitError('')
    const endpoint = (chargeMode === 'card-on-file' && selectedCard)
      ? '/api/admin/charge'
      : '/api/admin/bookings'
    const body = chargeMode === 'card-on-file' && selectedCard
      ? { squareCardId: selectedCard.id, squareCustomerId: selectedCustomer?.squareCustomerId, ...manual }
      : manual
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
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
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'cancelled' }),
    })
    setCancelling(null)
    fetchBookings()
  }

  const closeModal = () => { setShowManual(false); resetModal() }

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) closeModal()
  }

  const now = new Date()
  const upcoming = bookings.filter(b => new Date(b.start_time) >= now && b.status !== 'cancelled')
  const past = bookings.filter(b => new Date(b.start_time) < now || b.status === 'cancelled')
  const displayed = tab === 'upcoming' ? upcoming : tab === 'past' ? past : bookings
  const confirmed = bookings.filter(b => b.status === 'confirmed')
  const thisMonth = confirmed.filter(b => {
    const d = new Date(b.start_time)
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear()
  })
  const revenueTotal = confirmed.reduce((s, b) => s + (b.total_amount || 0), 0)
  const revenueThisMonth = thisMonth.reduce((s, b) => s + (b.total_amount || 0), 0)

  const submitLabel = submitSuccess
    ? 'BOOKING ADDED'
    : submitting
      ? 'PROCESSING...'
      : chargeMode === 'card-on-file' && selectedCard
        ? `CHARGE ${selectedCard.brand?.replace('_', ' ')} **** ${selectedCard.last4}`
        : 'ADD BOOKING'

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#fff', fontFamily: 'Inter, sans-serif' }}>

      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', padding: '20px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.05em' }}>
          MADE KULTURE <span style={{ color: 'rgba(255,255,255,0.3)', fontSize: 16 }}>/ ADMIN</span>
        </div>
        <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
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

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px' }}>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1, background: 'rgba(255,255,255,0.05)', marginBottom: 40 }}>
          {[
            { label: 'ALL-TIME REVENUE', value: `$${revenueTotal.toLocaleString()}` },
            { label: 'THIS MONTH', value: `$${revenueThisMonth.toLocaleString()}` },
            { label: 'TOTAL BOOKINGS', value: confirmed.length.toString() },
            { label: 'UPCOMING', value: upcoming.length.toString() },
          ].map(stat => (
            <div key={stat.label} style={{ background: '#0d0d0d', padding: '24px 28px' }}>
              <div style={{ ...labelStyle, marginBottom: 10 }}>{stat.label}</div>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, color: '#fff', letterSpacing: '0.02em' }}>{stat.value}</div>
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.08)', marginBottom: 32 }}>
          {(['upcoming', 'past', 'all'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{
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
          <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
            {displayed.map(b => {
              const isOpen = expanded === b.id
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
                        <Detail label="PHONE" value={b.customers?.phone || '—'} />
                        <Detail label="SOURCE" value={b.source || '—'} />
                        {b.notes && <Detail label="NOTES" value={b.notes} />}
                        {b.square_payment_id && <Detail label="SQUARE PAYMENT ID" value={b.square_payment_id} mono />}
                        {b.booking_addons?.length > 0 && (
                          <div>
                            <div style={{ ...labelStyle }}>EQUIPMENT</div>
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
      </div>

      {showManual && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 24 }} onClick={handleBackdropClick}>
          <div style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.1)', padding: 40, width: '100%', maxWidth: 560, maxHeight: '92vh', overflowY: 'auto' }}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, letterSpacing: '0.05em' }}>MANUAL BOOKING</div>
              <button onClick={closeModal} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 20 }}>
                X
              </button>
            </div>

            <div style={{ marginBottom: 28, paddingBottom: 28, borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
              <label style={labelStyle}>SEARCH EXISTING CUSTOMER</label>
              <div style={{ position: 'relative' }}>
                <input
                  value={searchQuery}
                  onChange={e => { setSearchQuery(e.target.value); if (!e.target.value) clearCustomer() }}
                  placeholder="Name, email, or phone..."
                  style={{ ...inputStyle, paddingRight: selectedCustomer ? 36 : 14 }}
                />
                {selectedCustomer && (
                  <button onClick={clearCustomer}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 16 }}>
                    x
                  </button>
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
                          {c.hasCardOnFile && (
                            <span style={{ fontSize: 10, letterSpacing: '0.1em', color: '#4ade80', border: '1px solid rgba(74,222,128,0.3)', padding: '1px 6px' }}>CARD ON FILE</span>
                          )}
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
                        <label key={card.id}
                          style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: `1px solid ${selectedCard?.id === card.id ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.1)'}`, marginBottom: 8, cursor: 'pointer' }}>
                          <input type="radio" name="card" checked={selectedCard?.id === card.id}
                            onChange={() => setSelectedCard(card)}
                            style={{ accentColor: '#fff' }} />
                          <span style={{ fontSize: 13, color: '#fff' }}>{cardLabel(card)}</span>
                        </label>
                      ))}
                      <div style={{ display: 'flex', gap: 20, marginTop: 12 }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                          <input type="radio" name="chargeMode" checked={chargeMode === 'card-on-file'}
                            onChange={() => setChargeMode('card-on-file')} style={{ accentColor: '#fff' }} />
                          <span style={{ fontSize: 12, color: chargeMode === 'card-on-file' ? '#fff' : 'rgba(255,255,255,0.4)' }}>Charge card on file</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                          <input type="radio" name="chargeMode" checked={chargeMode === 'log-only'}
                            onChange={() => setChargeMode('log-only')} style={{ accentColor: '#fff' }} />
                          <span style={{ fontSize: 12, color: chargeMode === 'log-only' ? '#fff' : 'rgba(255,255,255,0.4)' }}>Log only (no charge)</span>
                        </label>
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
                <input type="number" min="0" step="0.01" value={manual.totalAmount}
                  onChange={e => setManual(m => ({ ...m, totalAmount: Number(e.target.value) }))} style={inputStyle} />
              </Field>

              <Field label="NOTES (OPTIONAL)">
                <textarea value={manual.notes} onChange={e => setManual(m => ({ ...m, notes: e.target.value }))}
                  rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
              </Field>

              <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginTop: 4 }}>
                <input type="checkbox" checked={manual.sendSms} onChange={e => setManual(m => ({ ...m, sendSms: e.target.checked }))}
                  style={{ accentColor: '#fff', width: 16, height: 16 }} />
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>Send SMS confirmation to customer</span>
              </label>

              {submitError && (
                <div style={{ fontSize: 12, color: '#ff6b6b', marginTop: 4 }}>{submitError}</div>
              )}

              <button type="submit" disabled={submitting || submitSuccess}
                style={{
                  background: submitSuccess ? '#4ade80' : '#fff',
                  border: 'none', padding: '14px', marginTop: 8,
                  cursor: submitting || submitSuccess ? 'default' : 'pointer',
                  fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 500,
                  letterSpacing: '0.18em', color: '#080808',
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
