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

interface EmailSetting {
  key: string
  label: string
  description: string
  defaultSubject: string
  enabled: boolean
  subject: string | null
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
const TIME_SLOTS = Array.from({ length: 27 }, (_, i) => 9 + i * 0.5)  // 9:00 – 22:00 in 30-min steps
const SET_RATES: Record<string, number> = {
  'Set A': 40, 'Set B': 40, 'Set C': 40, 'Set D': 40,
  'Concrete': 40, 'Vintage': 40, 'Cottage': 40,
  'The Watering Hole': 75, 'Studio One': 65,
}
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

function hourToISO(date: string, hour: number): string {
  const h = Math.floor(hour)
  const m = hour % 1 !== 0 ? '30' : '00'
  return `${date}T${String(h).padStart(2, '0')}:${m}:00-05:00`
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
  const [view,          setView]          = useState<'list' | 'calendar' | 'emails'>('list')
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

  // Edit booking modal
  const [editBooking, setEditBooking] = useState<Booking | null>(null)
  const [editState,   setEditState]   = useState({ setName: '', date: '', startHour: 9, endHour: 11, notes: '', sendSms: true })
  const [editCards,   setEditCards]   = useState<SquareCard[]>([])
  const [editCard,    setEditCard]    = useState<SquareCard | null>(null)
  const [editSquareCustId, setEditSquareCustId] = useState<string | null>(null)
  const [editAction,        setEditAction]        = useState<'save' | 'link' | 'charge' | null>(null)
  const [editPayLink,       setEditPayLink]       = useState<string | null>(null)
  const [editError,         setEditError]         = useState('')
  const [editCopied,        setEditCopied]        = useState(false)
  const [editSmsStatus,     setEditSmsStatus]     = useState<'sent' | string | null>(null)
  const [editChargeSuccess, setEditChargeSuccess] = useState(false)

  const [manual, setManual] = useState({
    setSlug: 'set-a', date: tomorrow(), startHour: 10, endHour: 12,
    name: '', email: '', phone: '', notes: '', totalAmount: 0, sendSms: true,
  })
  const [submitting,   setSubmitting]   = useState(false)
  const [submitError,  setSubmitError]  = useState('')
  const [submitSuccess,setSubmitSuccess]= useState(false)

  const [emailSettings,    setEmailSettings]    = useState<EmailSetting[]>([])
  const [emailLoading,     setEmailLoading]     = useState(false)
  const [emailSaving,      setEmailSaving]       = useState<string | null>(null)
  const [emailEditKey,     setEmailEditKey]      = useState<string | null>(null)
  const [emailDraft,       setEmailDraft]        = useState<Partial<EmailSetting>>({})
  const [emailSaveMsg,     setEmailSaveMsg]      = useState<string | null>(null)
  const [emailPreviewKey,  setEmailPreviewKey]   = useState<string | null>(null)

  const fetchEmailSettings = useCallback(async () => {
    setEmailLoading(true)
    const res  = await fetch('/api/admin/email-settings')
    const data = await res.json()
    setEmailSettings(data.settings || [])
    setEmailLoading(false)
  }, [])

  useEffect(() => {
    if (view === 'emails') fetchEmailSettings()
  }, [view, fetchEmailSettings])

  async function saveEmailSetting(key: string, patch: Partial<EmailSetting>) {
    setEmailSaving(key)
    await fetch('/api/admin/email-settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ key, ...patch }),
    })
    await fetchEmailSettings()
    setEmailSaving(null)
    setEmailSaveMsg('Saved')
    setTimeout(() => setEmailSaveMsg(null), 2000)
  }

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

  const openEdit = async (b: Booking) => {
    setEditBooking(b)
    setEditState({
      setName:   b.sets?.name || '',
      date:      localDateStr(b.start_time),
      startHour: localHour(b.start_time),
      endHour:   localHour(b.end_time),
      notes:     b.notes || '',
      sendSms:   true,
    })
    setEditCards([]); setEditCard(null); setEditSquareCustId(null)
    setEditPayLink(null); setEditError(''); setEditAction(null); setEditCopied(false)
    setEditSmsStatus(null); setEditChargeSuccess(false)

    // Look up customer's Square cards
    if (b.customers?.email) {
      const res  = await fetch(`/api/admin/customers?q=${encodeURIComponent(b.customers.email)}`)
      const data = await res.json()
      const cust = (data.customers || []).find((c: CustomerResult) => c.email === b.customers?.email)
      if (cust?.squareCustomerId) {
        setEditSquareCustId(cust.squareCustomerId)
        const cr   = await fetch(`/api/admin/square-cards?customerId=${cust.squareCustomerId}`)
        const cd   = await cr.json()
        const list = cd.cards || []
        setEditCards(list); setEditCard(list[0] ?? null)
      }
    }
  }

  const handleEditSave = async () => {
    if (!editBooking || editAction) return
    setEditAction('save'); setEditError('')
    const res  = await fetch(`/api/admin/bookings/${editBooking.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start_time:   hourToISO(editState.date, editState.startHour),
        end_time:     hourToISO(editState.date, editState.endHour),
        setName:      editState.setName,
        notes:        editState.notes,
        total_amount: editNewTotal,
      }),
    })
    const data = await res.json()
    if (!res.ok) { setEditError(data.error || 'Failed to save'); setEditAction(null); return }
    setEditBooking(null); setEditAction(null)
    fetchBookings()
    if (detailBooking?.id === editBooking.id) setDetailBooking(null)
  }

  const handleEditLink = async () => {
    if (!editBooking || editAction || editDiff <= 0) return
    setEditAction('link'); setEditError('')
    // Save booking first (without updating total — they haven't paid yet)
    const saveRes = await fetch(`/api/admin/bookings/${editBooking.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start_time: hourToISO(editState.date, editState.startHour),
        end_time:   hourToISO(editState.date, editState.endHour),
        setName:    editState.setName,
        notes:      editState.notes,
      }),
    })
    if (!saveRes.ok) {
      const d = await saveRes.json()
      setEditError(d.error || 'Failed to update booking'); setEditAction(null); return
    }
    // Create payment link
    const linkRes = await fetch(`/api/admin/bookings/${editBooking.id}/payment-link`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount:       editDiff,
        description:  `Made Kulture — ${editState.setName} Booking Extension`,
        phone:        editBooking.customers?.phone || '',
        customerName: editBooking.customers?.name || '',
        sendSms:      editState.sendSms,
      }),
    })
    const linkData = await linkRes.json()
    if (!linkRes.ok) { setEditError(linkData.error || 'Failed to create payment link'); setEditAction(null); return }
    setEditPayLink(linkData.url)
    if (editState.sendSms) setEditSmsStatus(linkData.smsError || 'sent')
    setEditAction(null)
    fetchBookings()
  }

  const handleEditCharge = async () => {
    if (!editBooking || editAction || editDiff <= 0 || !editCard || !editSquareCustId) return
    setEditAction('charge'); setEditError('')
    // Save booking first
    const saveRes = await fetch(`/api/admin/bookings/${editBooking.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        start_time: hourToISO(editState.date, editState.startHour),
        end_time:   hourToISO(editState.date, editState.endHour),
        setName:    editState.setName,
        notes:      editState.notes,
      }),
    })
    if (!saveRes.ok) {
      const d = await saveRes.json()
      setEditError(d.error || 'Failed to update booking'); setEditAction(null); return
    }
    // Charge card
    const chargeRes = await fetch(`/api/admin/bookings/${editBooking.id}/charge`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        squareCardId:     editCard.id,
        squareCustomerId: editSquareCustId,
        amount:           editDiff,
        description:      `Made Kulture — ${editState.setName} Booking Extension`,
        phone:            editBooking.customers?.phone || '',
        customerName:     editBooking.customers?.name || '',
        email:            editBooking.customers?.email || '',
        sendSms:          editState.sendSms,
        newTotal:         editNewTotal,
      }),
    })
    const chargeData = await chargeRes.json()
    if (!chargeRes.ok) { setEditError(chargeData.error || 'Charge failed'); setEditAction(null); return }
    if (editState.sendSms) setEditSmsStatus(chargeData.smsError || 'sent')
    setEditChargeSuccess(true); setEditAction(null)
    fetchBookings()
    if (detailBooking?.id === editBooking.id) setDetailBooking(null)
    setTimeout(() => { setEditBooking(null); setEditChargeSuccess(false); setEditSmsStatus(null) }, 2500)
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

  // Edit modal derived values
  const editDuration = editState.endHour - editState.startHour
  const editRate     = SET_RATES[editState.setName] ?? 40
  const editNewTotal = Math.max(editDuration * editRate, 0)
  const editDiff     = editBooking ? editNewTotal - (editBooking.total_amount || 0) : 0

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
            {([['list', '≡ LIST'], ['calendar', '⊡ CALENDAR'], ['emails', '✉ EMAILS']] as const).map(([v, label]) => (
              <button key={v} onClick={() => setView(v)} style={{
                background: view === v ? '#fff' : 'transparent', border: 'none',
                borderLeft: v !== 'list' ? '1px solid rgba(255,255,255,0.15)' : 'none',
                padding: '8px 18px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                fontSize: 11, fontWeight: 500, letterSpacing: '0.15em',
                color: view === v ? '#080808' : 'rgba(255,255,255,0.4)',
              }}>
                {label}
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
                          </div>
                          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'flex-end', gap: 8 }}>
                            {!isCancelled && (
                              <>
                                <button onClick={() => openEdit(b)}
                                  style={{ background: '#fff', border: 'none', padding: '10px 20px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.12em', color: '#080808', fontWeight: 600 }}>
                                  EDIT
                                </button>
                                <button onClick={() => handleCancel(b.id)} disabled={cancelling === b.id}
                                  style={{ background: 'transparent', border: '1px solid rgba(255,100,100,0.4)', padding: '10px 20px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.12em', color: '#ff6b6b' }}>
                                  {cancelling === b.id ? 'CANCELLING...' : 'CANCEL'}
                                </button>
                              </>
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

        {/* CALENDAR VIEW */}
        {view === 'calendar' && (
          <div style={{ paddingBottom: 60 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
              <button onClick={() => setCalDate(d => addDays(d, -1))}
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '8px 16px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 13 }}>
                &larr; PREV
              </button>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 24, letterSpacing: '0.05em' }}>
                  {fmtCalHeader(calDate)}
                </div>
                {isToday && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.15em', marginTop: 4 }}>TODAY</div>}
              </div>
              <button onClick={() => setCalDate(d => addDays(d, 1))}
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '8px 16px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 13 }}>
                NEXT &rarr;
              </button>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <div style={{ minWidth: TIME_COL + CAL_SETS.length * SET_COL, position: 'relative' }}>
                <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 12 }}>
                  <div style={{ width: TIME_COL, flexShrink: 0 }} />
                  {CAL_SETS.map(s => (
                    <div key={s} style={{ width: SET_COL, flexShrink: 0, textAlign: 'center', fontSize: 10, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)' }}>
                      {s.toUpperCase()}
                    </div>
                  ))}
                </div>

                <div style={{ display: 'flex', position: 'relative' }}>
                  <div style={{ width: TIME_COL, flexShrink: 0 }}>
                    {HOURS.map(h => (
                      <div key={h} style={{ height: SLOT_H * 2, borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'flex-start', paddingTop: 4 }}>
                        <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.05em' }}>
                          {fmt12(h)}
                        </span>
                      </div>
                    ))}
                  </div>

                  {CAL_SETS.map(setName => {
                    const colBookings = dayBookings.filter(b => b.sets?.name === setName)
                    return (
                      <div key={setName} style={{ width: SET_COL, flexShrink: 0, position: 'relative', borderLeft: '1px solid rgba(255,255,255,0.06)' }}>
                        {HOURS.map(h => (
                          <div key={h} style={{ height: SLOT_H * 2, borderTop: '1px solid rgba(255,255,255,0.06)' }} />
                        ))}
                        {colBookings.map(b => {
                          const startH = localHour(b.start_time)
                          const endH   = localHour(b.end_time)
                          const top    = (startH - CAL_START) * SLOT_H * 2
                          const height = (endH - startH) * SLOT_H * 2
                          return (
                            <div key={b.id} onClick={() => setDetailBooking(b)}
                              style={{
                                position: 'absolute', top, left: 4, right: 4, height: Math.max(height - 4, 20),
                                background: 'rgba(255,255,255,0.12)', border: '1px solid rgba(255,255,255,0.2)',
                                borderRadius: 2, padding: '4px 6px', cursor: 'pointer', overflow: 'hidden',
                              }}>
                              <div style={{ fontSize: 10, color: '#fff', fontWeight: 500, lineHeight: 1.3 }}>
                                {b.customers?.name || '—'}
                              </div>
                              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>
                                {fmtTime(b.start_time)} – {fmtTime(b.end_time)}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}

                  {isToday && nowHour >= CAL_START && nowHour <= CAL_END && (
                    <div style={{
                      position: 'absolute', left: 0, right: 0, top: nowTop,
                      height: 1, background: '#ff6b6b', pointerEvents: 'none', zIndex: 10,
                    }}>
                      <div style={{ position: 'absolute', left: 0, top: -3, width: 7, height: 7, borderRadius: '50%', background: '#ff6b6b' }} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── EMAILS VIEW ───────────────────────────────────────────────────── */}
        {view === 'emails' && (
          <div style={{ maxWidth: 760, paddingBottom: 80 }}>
            <div style={{ marginBottom: 32 }}>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, letterSpacing: '0.05em', marginBottom: 8 }}>
                EMAIL SETTINGS
              </div>
              <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
                Control which emails get sent and customize their subject lines.
                Email bodies are branded templates — contact your developer to change the HTML layout.
              </p>
            </div>

            {emailLoading ? (
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, padding: '40px 0' }}>Loading...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {emailSettings.map(s => {
                  const isEditing = emailEditKey === s.key
                  const isSaving  = emailSaving === s.key

                  return (
                    <div key={s.key} style={{
                      background: '#0d0d0d',
                      border: isEditing ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.06)',
                      padding: '24px 28px',
                      transition: 'border-color 0.15s',
                    }}>
                      {/* Header row */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
                        <div style={{ flex: 1 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
                            {/* Enable/disable toggle */}
                            <button
                              onClick={() => saveEmailSetting(s.key, { enabled: !s.enabled, subject: s.subject })}
                              disabled={isSaving}
                              style={{
                                width: 40, height: 22, borderRadius: 11,
                                background: s.enabled ? '#4ade80' : 'rgba(255,255,255,0.12)',
                                border: 'none', cursor: 'pointer', position: 'relative',
                                transition: 'background 0.2s', flexShrink: 0,
                              }}
                            >
                              <span style={{
                                position: 'absolute', top: 3, width: 16, height: 16, borderRadius: '50%',
                                background: '#fff',
                                left: s.enabled ? 21 : 3,
                                transition: 'left 0.2s',
                              }} />
                            </button>
                            <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 16, letterSpacing: '0.05em', color: s.enabled ? '#fff' : 'rgba(255,255,255,0.4)' }}>
                              {s.label}
                            </span>
                            {!s.enabled && (
                              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em' }}>DISABLED</span>
                            )}
                          </div>
                          <p style={{ margin: 0, fontSize: 12, color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>{s.description}</p>
                        </div>

                        <button
                          onClick={() => {
                            if (isEditing) {
                              setEmailEditKey(null)
                            } else {
                              setEmailEditKey(s.key)
                              setEmailDraft({ subject: s.subject ?? '' })
                            }
                          }}
                          style={{
                            background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
                            color: isEditing ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.35)',
                            padding: '6px 16px', cursor: 'pointer',
                            fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.1em', flexShrink: 0,
                          }}>
                          {isEditing ? 'CLOSE' : 'EDIT'}
                        </button>
                      </div>

                      {/* Subject preview (collapsed) */}
                      {!isEditing && (
                        <div style={{ marginTop: 16, padding: '10px 14px', background: 'rgba(255,255,255,0.03)', borderLeft: '2px solid rgba(255,255,255,0.1)' }}>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', marginBottom: 4 }}>SUBJECT</div>
                          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', fontStyle: s.subject ? 'normal' : 'italic' }}>
                            {s.subject || s.defaultSubject}
                            {!s.subject && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.25)', marginLeft: 8 }}>(default)</span>}
                          </div>
                        </div>
                      )}

                      {/* Edit panel (expanded) */}
                      {isEditing && (
                        <div style={{ marginTop: 20, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
                          <div>
                            <label style={labelStyle}>SUBJECT LINE</label>
                            <div style={{ position: 'relative' }}>
                              <input
                                type="text"
                                value={emailDraft.subject ?? s.subject ?? ''}
                                onChange={e => setEmailDraft(d => ({ ...d, subject: e.target.value }))}
                                placeholder={s.defaultSubject}
                                style={{ ...inputStyle, paddingRight: 90 }}
                              />
                              {(emailDraft.subject || s.subject) && (
                                <button
                                  onClick={() => setEmailDraft(d => ({ ...d, subject: '' }))}
                                  style={{
                                    position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
                                    background: 'transparent', border: 'none', cursor: 'pointer',
                                    fontSize: 10, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em',
                                  }}>
                                  RESET
                                </button>
                              )}
                            </div>
                            <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
                              Available variables: <code style={{ color: 'rgba(255,255,255,0.4)' }}>{'{customer}'}</code> <code style={{ color: 'rgba(255,255,255,0.4)' }}>{'{set}'}</code> <code style={{ color: 'rgba(255,255,255,0.4)' }}>{'{date}'}</code>
                            </div>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                            <button
                              onClick={async () => {
                                const subjectVal = emailDraft.subject?.trim() || null
                                await saveEmailSetting(s.key, { enabled: s.enabled, subject: subjectVal })
                                setEmailEditKey(null)
                              }}
                              disabled={isSaving}
                              style={{
                                background: '#fff', border: 'none', padding: '10px 24px', cursor: 'pointer',
                                fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: '#080808',
                              }}>
                              {isSaving ? 'SAVING...' : 'SAVE'}
                            </button>
                            {emailSaveMsg && emailSaving === null && (
                              <span style={{ fontSize: 12, color: '#4ade80' }}>✓ {emailSaveMsg}</span>
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
        )}

      </div>

      {/* BOOKING DETAIL PANEL */}
      {detailBooking && (
        <div style={{
          position: 'fixed', right: 0, top: 0, bottom: 0, width: 380,
          background: '#0d0d0d', borderLeft: '1px solid rgba(255,255,255,0.08)',
          overflowY: 'auto', zIndex: 100, padding: '32px 28px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, letterSpacing: '0.05em' }}>BOOKING DETAIL</div>
            <button onClick={() => setDetailBooking(null)}
              style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>
              &#x2715;
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <Detail label="CUSTOMER" value={detailBooking.customers?.name || '—'} />
            <Detail label="EMAIL"    value={detailBooking.customers?.email || '—'} />
            <Detail label="PHONE"    value={detailBooking.customers?.phone || '—'} />
            <Detail label="SET"      value={detailBooking.sets?.name || 'Full Studio Takeover'} />
            <Detail label="DATE"     value={fmtDate(detailBooking.start_time)} />
            <Detail label="TIME"     value={`${fmtTime(detailBooking.start_time)} – ${fmtTime(detailBooking.end_time)}`} />
            <Detail label="DURATION" value={fmtDuration(detailBooking.start_time, detailBooking.end_time)} />
            <Detail label="TOTAL"    value={`$${detailBooking.total_amount?.toLocaleString()}`} />
            <Detail label="STATUS"   value={detailBooking.status.toUpperCase()} />
            <Detail label="SOURCE"   value={detailBooking.source || '—'} />
            {detailBooking.notes && <Detail label="NOTES" value={detailBooking.notes} />}
            {detailBooking.square_payment_id && <Detail label="SQUARE PAYMENT ID" value={detailBooking.square_payment_id} mono />}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 32 }}>
            {detailBooking.status !== 'cancelled' && (
              <button onClick={() => openEdit(detailBooking)}
                style={{ background: '#fff', border: 'none', padding: '12px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.15em', color: '#080808', fontWeight: 600 }}>
                EDIT BOOKING
              </button>
            )}
            {detailBooking.customers?.phone && (
              <button onClick={() => window.open(`sms:${detailBooking.customers?.phone}`, '_blank')}
                style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', padding: '12px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.15em', color: '#fff' }}>
                TEXT CUSTOMER
              </button>
            )}
            {detailBooking.status !== 'cancelled' && (
              <button onClick={() => handleCancel(detailBooking.id)} disabled={cancelling === detailBooking.id}
                style={{ background: 'transparent', border: '1px solid rgba(255,100,100,0.3)', padding: '12px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.15em', color: '#ff6b6b' }}>
                {cancelling === detailBooking.id ? 'CANCELLING...' : 'CANCEL BOOKING'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* EDIT BOOKING MODAL */}
      {editBooking && (
        <div onClick={(e) => { if (e.target === e.currentTarget && !editAction) setEditBooking(null) }}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#111', border: '1px solid rgba(255,255,255,0.12)', width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: 36 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.05em' }}>EDIT BOOKING</div>
              <button onClick={() => { if (!editAction) setEditBooking(null) }}
                style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 20 }}>
                &#x2715;
              </button>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.04)', padding: '14px 16px', marginBottom: 24, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Detail label="CUSTOMER"       value={editBooking.customers?.name || '—'} />
              <Detail label="EMAIL"          value={editBooking.customers?.email || '—'} />
              <Detail label="PHONE"          value={editBooking.customers?.phone || '—'} />
              <Detail label="ORIGINAL TOTAL" value={`$${editBooking.total_amount?.toLocaleString()}`} />
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
              <Field label="SET">
                <select value={editState.setName} onChange={e => setEditState(s => ({ ...s, setName: e.target.value }))}
                  style={{ ...inputStyle, appearance: 'none' as const }}>
                  {CAL_SETS.map(n => <option key={n} value={n} style={{ background: '#111' }}>{n}</option>)}
                </select>
              </Field>

              <Field label="DATE">
                <input type="date" value={editState.date} onChange={e => setEditState(s => ({ ...s, date: e.target.value }))}
                  style={{ ...inputStyle, colorScheme: 'dark' as const }} />
              </Field>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="START TIME">
                  <select value={editState.startHour} onChange={e => setEditState(s => ({ ...s, startHour: Number(e.target.value) }))}
                    style={{ ...inputStyle, appearance: 'none' as const }}>
                    {TIME_SLOTS.map(h => <option key={h} value={h} style={{ background: '#111' }}>{fmt12(h)}</option>)}
                  </select>
                </Field>
                <Field label="END TIME">
                  <select value={editState.endHour} onChange={e => setEditState(s => ({ ...s, endHour: Number(e.target.value) }))}
                    style={{ ...inputStyle, appearance: 'none' as const }}>
                    {TIME_SLOTS.filter(h => h > editState.startHour).map(h => (
                      <option key={h} value={h} style={{ background: '#111' }}>{fmt12(h)}</option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="NOTES">
                <textarea value={editState.notes} onChange={e => setEditState(s => ({ ...s, notes: e.target.value }))}
                  rows={3} style={{ ...inputStyle, resize: 'none' as const }} />
              </Field>
            </div>

            <div style={{ background: 'rgba(255,255,255,0.04)', padding: 16, marginTop: 24 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                  {editState.setName} &times; {editDuration} hr{editDuration !== 1 ? 's' : ''} @ ${editRate}/hr
                </span>
                <span style={{ fontSize: 12, color: '#fff' }}>${editNewTotal}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid rgba(255,255,255,0.1)', paddingTop: 8 }}>
                <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>DIFFERENCE</span>
                <span style={{ fontSize: 14, fontWeight: 600, color: editDiff > 0 ? '#4ade80' : editDiff < 0 ? '#ff6b6b' : 'rgba(255,255,255,0.4)' }}>
                  {editDiff > 0 ? `+$${editDiff.toFixed(2)}` : editDiff < 0 ? `-$${Math.abs(editDiff).toFixed(2)}` : 'No change'}
                </span>
              </div>
            </div>

            {editCards.length > 0 && editDiff > 0 && (
              <div style={{ marginTop: 16 }}>
                <label style={labelStyle}>CARD ON FILE</label>
                <select value={editCard?.id || ''} onChange={e => setEditCard(editCards.find(c => c.id === e.target.value) || null)}
                  style={{ ...inputStyle, appearance: 'none' as const }}>
                  {editCards.map(c => (
                    <option key={c.id} value={c.id} style={{ background: '#111' }}>{cardLabel(c)}</option>
                  ))}
                </select>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 16 }}>
              <input type="checkbox" id="edit-sms" checked={editState.sendSms}
                onChange={e => setEditState(s => ({ ...s, sendSms: e.target.checked }))} />
              <label htmlFor="edit-sms" style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }}>
                NOTIFY CUSTOMER VIA SMS
              </label>
            </div>

            {editSmsStatus && (
              <div style={{ fontSize: 11, marginTop: 6, marginLeft: 28, color: editSmsStatus === 'sent' ? '#4ade80' : '#fbbf24' }}>
                {editSmsStatus === 'sent' ? '✓ SMS sent' : `SMS failed: ${editSmsStatus}`}
              </div>
            )}

            {editChargeSuccess && (
              <div style={{ background: 'rgba(74,222,128,0.1)', border: '1px solid rgba(74,222,128,0.3)', padding: '12px 16px', marginTop: 16, textAlign: 'center' }}>
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 16, color: '#4ade80', letterSpacing: '0.05em' }}>
                  PAYMENT CHARGED SUCCESSFULLY
                </div>
              </div>
            )}

            {editPayLink && (
              <div style={{ background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)', padding: '12px 16px', marginTop: 16 }}>
                <div style={{ fontSize: 11, color: '#4ade80', letterSpacing: '0.1em', marginBottom: 8 }}>PAYMENT LINK CREATED</div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <span style={{ fontSize: 12, color: '#fff', wordBreak: 'break-all', flex: 1 }}>{editPayLink}</span>
                  <button onClick={() => { navigator.clipboard.writeText(editPayLink); setEditCopied(true); setTimeout(() => setEditCopied(false), 2000) }}
                    style={{ background: '#4ade80', border: 'none', padding: '6px 12px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 10, letterSpacing: '0.1em', color: '#080808', flexShrink: 0 }}>
                    {editCopied ? 'COPIED' : 'COPY'}
                  </button>
                </div>
              </div>
            )}

            {editError && (
              <div style={{ color: '#ff6b6b', fontSize: 12, marginTop: 12 }}>{editError}</div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 24, flexWrap: 'wrap' as const }}>
              <button onClick={handleEditSave} disabled={!!editAction}
                style={{ flex: 1, minWidth: 120, background: editAction === 'save' ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.15)', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '12px', cursor: editAction ? 'wait' : 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.12em' }}>
                {editAction === 'save' ? 'SAVING...' : 'SAVE ONLY'}
              </button>
              {editDiff > 0 && (
                <>
                  <button onClick={handleEditLink} disabled={!!editAction}
                    style={{ flex: 1, minWidth: 160, background: editAction === 'link' ? 'rgba(255,255,255,0.5)' : '#fff', border: 'none', color: '#080808', padding: '12px', cursor: editAction ? 'wait' : 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.12em', fontWeight: 600 }}>
                    {editAction === 'link' ? 'CREATING...' : `SEND LINK +$${editDiff.toFixed(2)}`}
                  </button>
                  {editCards.length > 0 && editCard && (
                    <button onClick={handleEditCharge} disabled={!!editAction}
                      style={{ flex: 1, minWidth: 160, background: editAction === 'charge' ? 'rgba(74,222,128,0.5)' : 'rgba(74,222,128,0.15)', border: '1px solid rgba(74,222,128,0.3)', color: '#4ade80', padding: '12px', cursor: editAction ? 'wait' : 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.12em' }}>
                      {editAction === 'charge' ? 'CHARGING...' : `CHARGE CARD +$${editDiff.toFixed(2)}`}
                    </button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* MANUAL BOOKING MODAL */}
      {showManual && (
        <div onClick={handleBackdropClick}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
          <div style={{ background: '#111', border: '1px solid rgba(255,255,255,0.12)', width: '100%', maxWidth: 560, maxHeight: '90vh', overflowY: 'auto', padding: 36 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.05em' }}>MANUAL BOOKING</div>
              <button onClick={closeModal}
                style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 20 }}>
                &#x2715;
              </button>
            </div>

            {submitSuccess ? (
              <div style={{ textAlign: 'center', padding: '40px 0' }}>
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, color: '#4ade80', letterSpacing: '0.05em' }}>BOOKING ADDED</div>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div style={{ position: 'relative' }}>
                  <label style={labelStyle}>SEARCH EXISTING CUSTOMER</label>
                  {selectedCustomer ? (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'rgba(74,222,128,0.08)', border: '1px solid rgba(74,222,128,0.2)' }}>
                      <div>
                        <div style={{ fontSize: 13, color: '#fff', marginBottom: 2 }}>{selectedCustomer.name}</div>
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{selectedCustomer.email}</div>
                        {selectedCustomer.hasCardOnFile && <div style={{ fontSize: 10, color: '#4ade80', marginTop: 4 }}>Card on file</div>}
                      </div>
                      <button type="button" onClick={clearCustomer}
                        style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 16 }}>
                        &#x2715;
                      </button>
                    </div>
                  ) : (
                    <>
                      <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
                        placeholder="Search by name, email, or phone..."
                        style={{ ...inputStyle, paddingRight: searching ? 36 : 14 }} />
                      {searching && <div style={{ position: 'absolute', right: 10, top: 38, fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>...</div>}
                      {searchResults.length > 0 && (
                        <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: '#1a1a1a', border: '1px solid rgba(255,255,255,0.12)', zIndex: 50, maxHeight: 200, overflowY: 'auto' }}>
                          {searchResults.map(c => (
                            <div key={c.id} onClick={() => selectCustomer(c)}
                              style={{ padding: '12px 14px', cursor: 'pointer', borderBottom: '1px solid rgba(255,255,255,0.06)' }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                              <div style={{ fontSize: 13, color: '#fff' }}>{c.name}</div>
                              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{c.email} &middot; {c.phone}</div>
                              {c.hasCardOnFile && <div style={{ fontSize: 10, color: '#4ade80', marginTop: 2 }}>Card on file</div>}
                            </div>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field label="NAME">
                    <input required value={manual.name} onChange={e => setManual(m => ({ ...m, name: e.target.value }))} style={inputStyle} />
                  </Field>
                  <Field label="PHONE">
                    <input required value={manual.phone} onChange={e => setManual(m => ({ ...m, phone: e.target.value }))} style={inputStyle} />
                  </Field>
                </div>
                <Field label="EMAIL">
                  <input type="email" required value={manual.email} onChange={e => setManual(m => ({ ...m, email: e.target.value }))} style={inputStyle} />
                </Field>

                <Field label="SET">
                  <select value={manual.setSlug} onChange={e => setManual(m => ({ ...m, setSlug: e.target.value }))}
                    style={{ ...inputStyle, appearance: 'none' as const }}>
                    {SETS.map(s => <option key={s.id} value={s.id} style={{ background: '#111' }}>{s.name}</option>)}
                  </select>
                </Field>

                <Field label="DATE">
                  <input type="date" value={manual.date} onChange={e => setManual(m => ({ ...m, date: e.target.value }))}
                    style={{ ...inputStyle, colorScheme: 'dark' as const }} />
                </Field>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <Field label="START HOUR (24h)">
                    <input type="number" min={9} max={21} value={manual.startHour}
                      onChange={e => setManual(m => ({ ...m, startHour: Number(e.target.value) }))} style={inputStyle} />
                  </Field>
                  <Field label="END HOUR (24h)">
                    <input type="number" min={10} max={22} value={manual.endHour}
                      onChange={e => setManual(m => ({ ...m, endHour: Number(e.target.value) }))} style={inputStyle} />
                  </Field>
                </div>

                <Field label="TOTAL AMOUNT ($)">
                  <input type="number" min={0} step={0.01} value={manual.totalAmount}
                    onChange={e => setManual(m => ({ ...m, totalAmount: Number(e.target.value) }))} style={inputStyle} />
                </Field>

                <Field label="NOTES (optional)">
                  <textarea value={manual.notes} onChange={e => setManual(m => ({ ...m, notes: e.target.value }))}
                    rows={3} style={{ ...inputStyle, resize: 'none' as const }} />
                </Field>

                {selectedCustomer?.hasCardOnFile && (
                  <div style={{ background: 'rgba(255,255,255,0.04)', padding: '14px 16px', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <label style={labelStyle}>PAYMENT METHOD</label>
                    <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                        <input type="radio" name="chargeMode" checked={chargeMode === 'log-only'} onChange={() => setChargeMode('log-only')} />
                        Log only (no charge)
                      </label>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>
                        <input type="radio" name="chargeMode" checked={chargeMode === 'card-on-file'} onChange={() => setChargeMode('card-on-file')} />
                        Charge card on file
                      </label>
                    </div>
                    {chargeMode === 'card-on-file' && (
                      loadingCards ? (
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>LOADING CARDS...</div>
                      ) : cards.length > 0 ? (
                        <select value={selectedCard?.id || ''} onChange={e => setSelectedCard(cards.find(c => c.id === e.target.value) || null)}
                          style={{ ...inputStyle, appearance: 'none' as const }}>
                          {cards.map(c => (
                            <option key={c.id} value={c.id} style={{ background: '#111' }}>{cardLabel(c)}</option>
                          ))}
                        </select>
                      ) : (
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>No cards found</div>
                      )
                    )}
                  </div>
                )}

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input type="checkbox" id="sendSms" checked={manual.sendSms}
                    onChange={e => setManual(m => ({ ...m, sendSms: e.target.checked }))} />
                  <label htmlFor="sendSms" style={{ ...labelStyle, marginBottom: 0, cursor: 'pointer' }}>
                    SEND CONFIRMATION SMS
                  </label>
                </div>

                {submitError && (
                  <div style={{ color: '#ff6b6b', fontSize: 12 }}>{submitError}</div>
                )}

                <button type="submit" disabled={submitting || submitSuccess}
                  style={{
                    background: submitSuccess ? '#4ade80' : '#fff', border: 'none',
                    padding: '14px', cursor: submitting ? 'wait' : 'pointer',
                    fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 500,
                    letterSpacing: '0.15em', color: '#080808',
                  }}>
                  {submitLabel}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
