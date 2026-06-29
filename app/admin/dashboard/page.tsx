'use client'
import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'

// ── Types ──────────────────────────────────────────────────────────────────────

interface StudioSet {
  id: string
  name: string
  slug: string | null
  description: string | null
  rate_per_hour: number
  min_hours: number | null
  capacity: number
  features: string[]
  photo_url: string | null
  dimensions: string | null
  sort_order: number | null
  category: string | null
  accent_gradient: string | null
  is_active: boolean
}

interface SetDraft {
  name: string
  slug: string
  description: string
  rate_per_hour: string
  min_hours: string
  capacity: string
  features: string
  photo_url: string
  dimensions: string
  sort_order: string
  category: string
  accent_gradient: string
  is_active: boolean
}

const EMPTY_SET_DRAFT: SetDraft = {
  name: '', slug: '', description: '', rate_per_hour: '40', min_hours: '1',
  capacity: '5', features: '', photo_url: '', dimensions: '', sort_order: '100',
  category: 'standard', accent_gradient: '', is_active: true,
}

interface EquipmentItem {
  id: string
  name: string
  rate: number
  category: 'lighting' | 'modifier' | 'special_effects' | 'camera'
  quantity: number
  description: string | null
  image_url: string | null
  sort_order: number | null
  is_available: boolean
  allow_offsite: boolean
  deposit: number
  in_use_now: number
  available_now: number
}

interface EquipDraft {
  name: string
  category: string
  rate: string
  quantity: string
  description: string
  image_url: string
  is_available: boolean
  allow_offsite: boolean
}

const EMPTY_EQUIP_DRAFT: EquipDraft = {
  name: '', category: 'lighting', rate: '', quantity: '1',
  description: '', image_url: '', is_available: true, allow_offsite: false,
}

const EQUIP_CATEGORIES: { value: string; label: string }[] = [
  { value: 'lighting',        label: 'Lighting' },
  { value: 'modifier',        label: 'Modifiers' },
  { value: 'special_effects', label: 'Special Effects' },
  { value: 'camera',          label: 'Camera' },
]

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
  customers: { name: string; email: string; phone: string; status?: string; banned?: boolean } | null
  booking_add_ons?: { quantity: number; rate: number; paid?: boolean; equipment: { name: string } | null }[]
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

interface CustomerListItem {
  id: string
  name: string
  email: string
  phone: string
  status: string
  banned: boolean
  createdAt: string
  totalBookings: number
  confirmedBookings: number
  totalSpend: number
}

interface CustomerNote {
  id: string
  note: string
  tag: string
  created_at: string
}

interface PricingOverrides {
  hourly_rate?: number | null
  equipment_discount_percent?: number | null
  sets?: Record<string, number | null>
}

interface CustomerDetailData {
  id: string
  name: string
  email: string
  phone: string
  status: string
  banned: boolean
  pricingOverrides: PricingOverrides | null
  createdAt: string
  squareCustomerId: string | null
  acuityClientId: string | null
  bookings: any[]
  notes: CustomerNote[]
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
  const [view,          setView]          = useState<'list' | 'calendar' | 'emails' | 'profile' | 'customers' | 'sets' | 'equipment'>('list')
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

  // Profile
  const [profileMagicSent,  setProfileMagicSent]  = useState(false)
  const [profileMagicLoading, setProfileMagicLoading] = useState(false)
  const [profilePwOld,      setProfilePwOld]      = useState('')
  const [profilePwNew,      setProfilePwNew]      = useState('')
  const [profilePwConfirm,  setProfilePwConfirm]  = useState('')
  const [profilePwMsg,      setProfilePwMsg]      = useState<{ type: 'success' | 'error'; text: string } | null>(null)
  const [profilePwLoading,  setProfilePwLoading]  = useState(false)
  const [profileShowOld,    setProfileShowOld]    = useState(false)
  const [profileShowNew,    setProfileShowNew]    = useState(false)

  // Customers view
  const [custList,         setCustList]         = useState<CustomerListItem[]>([])
  const [custTotal,        setCustTotal]        = useState(0)
  const [custPage,         setCustPage]         = useState(1)
  const [custSearch,       setCustSearch]       = useState('')
  const [custFilter,       setCustFilter]       = useState('all')
  const [custLoading,      setCustLoading]      = useState(false)
  const [custImporting,    setCustImporting]    = useState(false)
  const [custImportResult, setCustImportResult] = useState<{ totalUpserted: number } | null>(null)
  const [custDetail,       setCustDetail]       = useState<CustomerDetailData | null>(null)
  const [custDetailLoading,setCustDetailLoading]= useState(false)
  const [custEditMode,     setCustEditMode]     = useState(false)
  const [custEditDraft,    setCustEditDraft]    = useState({ name: '', email: '', phone: '' })
  const [custEditSaving,   setCustEditSaving]   = useState(false)
  const [custNoteText,     setCustNoteText]     = useState('')
  const [custNoteTag,      setCustNoteTag]      = useState('general')
  const [custNoteAdding,   setCustNoteAdding]   = useState(false)
  const [custPricingDraft,  setCustPricingDraft]  = useState<{ hourly_rate: string; equipment_discount_percent: string; sets: Record<string, string> }>({ hourly_rate: '', equipment_discount_percent: '', sets: {} })
  const [custPricingSaving, setCustPricingSaving] = useState(false)
  const [dupGroups,         setDupGroups]         = useState<any[]>([])
  const [dupLoading,        setDupLoading]         = useState(false)
  const [dupPanelOpen,      setDupPanelOpen]       = useState(false)
  const [dupPrimaryMap,     setDupPrimaryMap]       = useState<Record<number, string>>({})  // groupIdx → primaryId
  const [dupMerging,        setDupMerging]          = useState<number | null>(null)
  const [dupMergingAll,     setDupMergingAll]        = useState(false)
  const [dupMergeResult,    setDupMergeResult]      = useState<Record<number, string>>({})
  const custSearchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const [bookingsOpen,     setBookingsOpen]     = useState(true)

  const [emailSettings,    setEmailSettings]    = useState<EmailSetting[]>([])
  const [emailLoading,     setEmailLoading]     = useState(false)
  const [emailSaving,      setEmailSaving]       = useState<string | null>(null)
  const [emailEditKey,     setEmailEditKey]      = useState<string | null>(null)
  const [emailDraft,       setEmailDraft]        = useState<Partial<EmailSetting>>({})
  const [emailSaveMsg,     setEmailSaveMsg]      = useState<string | null>(null)
  const [emailPreviewKey,  setEmailPreviewKey]   = useState<string | null>(null)
  const [banMessage,       setBanMessage]        = useState('We were unable to process your booking. Please contact the studio directly at (832) 408-1631.')
  const [banMessageSaving, setBanMessageSaving]  = useState(false)
  const [banMessageSaved,  setBanMessageSaved]   = useState(false)
  const [buyoutRate,       setBuyoutRate]        = useState('400')
  const [buyoutSaving,     setBuyoutSaving]      = useState(false)
  const [buyoutSaved,      setBuyoutSaved]       = useState(false)

  // ── Sets Manager ───────────────────────────────────────────────────────────
  const [setsList,     setSetsList]     = useState<StudioSet[]>([])
  const [setsLoading,  setSetsLoading]  = useState(false)
  const [setsError,    setSetsError]    = useState('')
  const [setEditId,    setSetEditId]    = useState<string | null>(null)   // set id, or 'new', or null
  const [setDraft,     setSetDraft]     = useState<SetDraft>(EMPTY_SET_DRAFT)
  const [setsSaving,   setSetsSaving]   = useState(false)
  const [setsBusyId,   setSetsBusyId]   = useState<string | null>(null)   // toggling/deleting row

  // ── Equipment Manager ────────────────────────────────────────────────────────
  const [equipList,    setEquipList]    = useState<EquipmentItem[]>([])
  const [equipLoading, setEquipLoading] = useState(false)
  const [equipError,   setEquipError]   = useState('')
  const [equipEditId,  setEquipEditId]  = useState<string | null>(null)   // id, 'new', or null
  const [equipDraft,   setEquipDraft]   = useState<EquipDraft>(EMPTY_EQUIP_DRAFT)
  const [equipSaving,  setEquipSaving]  = useState(false)
  const [equipBusyId,  setEquipBusyId]  = useState<string | null>(null)

  // ── Customer fetch helpers ───────────────────────────────────────────────
  const fetchCustomers = useCallback(async (search: string, filter: string, page: number) => {
    setCustLoading(true)
    const params = new URLSearchParams({ page: String(page), limit: '50' })
    if (search.trim().length >= 2) params.set('q', search.trim())
    if (filter !== 'all') params.set('status', filter)
    const res = await fetch(`/api/admin/customers?${params}`, { headers: { 'x-admin-password': document.cookie.match(/admin_token=([^;]+)/)?.[1] ?? '' } })
    const data = await res.json()
    setCustList(data.customers ?? [])
    setCustTotal(data.total ?? 0)
    setCustLoading(false)
  }, [])

  useEffect(() => {
    if (view === 'customers') fetchCustomers(custSearch, custFilter, custPage)
  }, [view, custPage, custFilter]) // eslint-disable-line

  const fetchCustomerDetail = useCallback(async (id: string) => {
    setCustDetailLoading(true)
    const res = await fetch(`/api/admin/customers/${id}`)
    const data = await res.json()
    const cust = data.customer ?? null
    setCustDetail(cust)
    if (cust?.pricingOverrides) {
      const po = cust.pricingOverrides
      setCustPricingDraft({
        hourly_rate: po.hourly_rate != null ? String(po.hourly_rate) : '',
        equipment_discount_percent: po.equipment_discount_percent != null ? String(po.equipment_discount_percent) : '',
        sets: Object.fromEntries(
          Object.entries(po.sets ?? {}).map(([k, v]) => [k, v != null ? String(v) : ''])
        ),
      })
    } else {
      setCustPricingDraft({ hourly_rate: '', equipment_discount_percent: '', sets: {} })
    }
    setCustDetailLoading(false)
  }, [])

  const fetchEmailSettings = useCallback(async () => {
    setEmailLoading(true)
    const res  = await fetch('/api/admin/email-settings')
    const data = await res.json()
    setEmailSettings(data.settings || [])
    setEmailLoading(false)
  }, [])

  useEffect(() => {
    if (view === 'emails') {
      fetchEmailSettings()
      fetch('/api/admin/settings?key=ban_message')
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.value) setBanMessage(d.value) })
        .catch(() => {})
      fetch('/api/admin/settings?key=buyout_rate')
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d?.value) setBuyoutRate(String(d.value)) })
        .catch(() => {})
    }
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

  // ── Sets Manager helpers ─────────────────────────────────────────────────────
  const fetchSets = useCallback(async () => {
    setSetsLoading(true); setSetsError('')
    try {
      const res  = await fetch('/api/admin/sets')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load sets')
      setSetsList(data.sets ?? [])
    } catch (e: any) {
      setSetsError(e.message || 'Failed to load sets')
    }
    setSetsLoading(false)
  }, [])

  useEffect(() => { if (view === 'sets') fetchSets() }, [view, fetchSets])

  const startNewSet = () => {
    setSetEditId('new')
    setSetDraft(EMPTY_SET_DRAFT)
    setSetsError('')
  }

  const startEditSet = (s: StudioSet) => {
    setSetEditId(s.id)
    setSetsError('')
    setSetDraft({
      name:          s.name,
      slug:          s.slug ?? '',
      description:   s.description ?? '',
      rate_per_hour: String(s.rate_per_hour),
      min_hours:     s.min_hours == null ? '' : String(s.min_hours),
      capacity:      String(s.capacity),
      features:      (s.features ?? []).join(', '),
      photo_url:     s.photo_url ?? '',
      dimensions:    s.dimensions ?? '',
      sort_order:    s.sort_order == null ? '100' : String(s.sort_order),
      category:      s.category ?? 'standard',
      accent_gradient: s.accent_gradient ?? '',
      is_active:     s.is_active,
    })
  }

  const cancelEditSet = () => { setSetEditId(null); setSetDraft(EMPTY_SET_DRAFT); setSetsError('') }

  const saveSet = async () => {
    if (!setDraft.name.trim()) { setSetsError('Set name is required'); return }
    setSetsSaving(true); setSetsError('')
    try {
      const isNew = setEditId === 'new'
      const res = await fetch(isNew ? '/api/admin/sets' : `/api/admin/sets/${setEditId}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:          setDraft.name,
          slug:          setDraft.slug,
          description:   setDraft.description,
          rate_per_hour: setDraft.rate_per_hour,
          min_hours:     setDraft.min_hours === '' ? null : setDraft.min_hours,
          capacity:      setDraft.capacity,
          features:      setDraft.features,
          photo_url:     setDraft.photo_url,
          dimensions:    setDraft.dimensions,
          sort_order:    setDraft.sort_order,
          category:      setDraft.category,
          accent_gradient: setDraft.accent_gradient,
          is_active:     setDraft.is_active,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not save set')
      cancelEditSet()
      await fetchSets()
    } catch (e: any) {
      setSetsError(e.message || 'Could not save set')
    }
    setSetsSaving(false)
  }

  const toggleSetActive = async (s: StudioSet) => {
    setSetsBusyId(s.id); setSetsError('')
    try {
      const res = await fetch(`/api/admin/sets/${s.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_active: !s.is_active }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not update set')
      await fetchSets()
    } catch (e: any) {
      setSetsError(e.message || 'Could not update set')
    }
    setSetsBusyId(null)
  }

  const deleteSet = async (s: StudioSet) => {
    if (!confirm(`Delete "${s.name}"? This can't be undone. (If it has bookings, deactivate it instead.)`)) return
    setSetsBusyId(s.id); setSetsError('')
    try {
      const res = await fetch(`/api/admin/sets/${s.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not delete set')
      await fetchSets()
    } catch (e: any) {
      setSetsError(e.message || 'Could not delete set')
    }
    setSetsBusyId(null)
  }

  // ── Equipment Manager helpers ─────────────────────────────────────────────────
  const fetchEquipment = useCallback(async () => {
    setEquipLoading(true); setEquipError('')
    try {
      const res  = await fetch('/api/admin/equipment')
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to load equipment')
      setEquipList(data.equipment ?? [])
    } catch (e: any) {
      setEquipError(e.message || 'Failed to load equipment')
    }
    setEquipLoading(false)
  }, [])

  useEffect(() => { if (view === 'equipment') fetchEquipment() }, [view, fetchEquipment])

  const startNewEquip = () => { setEquipEditId('new'); setEquipDraft(EMPTY_EQUIP_DRAFT); setEquipError('') }

  const startEditEquip = (e: EquipmentItem) => {
    setEquipEditId(e.id); setEquipError('')
    setEquipDraft({
      name:          e.name,
      category:      e.category,
      rate:          String(e.rate),
      quantity:      String(e.quantity),
      description:   e.description ?? '',
      image_url:     e.image_url ?? '',
      is_available:  e.is_available,
      allow_offsite: e.allow_offsite,
    })
  }

  const cancelEditEquip = () => { setEquipEditId(null); setEquipDraft(EMPTY_EQUIP_DRAFT); setEquipError('') }

  const saveEquip = async () => {
    if (!equipDraft.name.trim()) { setEquipError('Equipment name is required'); return }
    setEquipSaving(true); setEquipError('')
    try {
      const isNew = equipEditId === 'new'
      const res = await fetch(isNew ? '/api/admin/equipment' : `/api/admin/equipment/${equipEditId}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name:          equipDraft.name,
          category:      equipDraft.category,
          rate:          equipDraft.rate,
          quantity:      equipDraft.quantity,
          description:   equipDraft.description,
          image_url:     equipDraft.image_url,
          is_available:  equipDraft.is_available,
          allow_offsite: equipDraft.allow_offsite,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not save equipment')
      cancelEditEquip()
      await fetchEquipment()
    } catch (e: any) {
      setEquipError(e.message || 'Could not save equipment')
    }
    setEquipSaving(false)
  }

  const toggleEquipAvailable = async (e: EquipmentItem) => {
    setEquipBusyId(e.id); setEquipError('')
    try {
      const res = await fetch(`/api/admin/equipment/${e.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_available: !e.is_available }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not update equipment')
      await fetchEquipment()
    } catch (err: any) {
      setEquipError(err.message || 'Could not update equipment')
    }
    setEquipBusyId(null)
  }

  const deleteEquip = async (e: EquipmentItem) => {
    if (!confirm(`Delete "${e.name}"? This can't be undone. (If it's on bookings, set it unavailable instead.)`)) return
    setEquipBusyId(e.id); setEquipError('')
    try {
      const res = await fetch(`/api/admin/equipment/${e.id}`, { method: 'DELETE' })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not delete equipment')
      await fetchEquipment()
    } catch (err: any) {
      setEquipError(err.message || 'Could not delete equipment')
    }
    setEquipBusyId(null)
  }

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

      {/* ── SIDEBAR ─────────────────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', left: 0, top: 0, bottom: 0, width: 220,
        background: '#080808', borderRight: '1px solid rgba(255,255,255,0.06)',
        display: 'flex', flexDirection: 'column', zIndex: 50,
      }}>
        {/* Wordmark */}
        <div style={{ padding: '28px 24px 24px' }}>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, letterSpacing: '0.05em', color: '#fff', lineHeight: 1 }}>
            MADE KULTURE
          </div>
          <div style={{ fontSize: 10, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.25)', marginTop: 3 }}>/ ADMIN</div>
          <div style={{ marginTop: 12, width: 24, height: 2, background: '#d4a843' }} />
        </div>

        {/* Nav */}
        <nav style={{ flex: 1, padding: '4px 12px', overflowY: 'auto' }}>

          {/* Bookings group */}
          <button onClick={() => setBookingsOpen(o => !o)} style={{
            width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'transparent', border: 'none', cursor: 'pointer',
            padding: '6px 12px 6px 14px', color: 'rgba(255,255,255,0.25)',
            fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600, letterSpacing: '0.15em',
          }}>
            BOOKINGS <span style={{ fontSize: 8 }}>{bookingsOpen ? '▲' : '▼'}</span>
          </button>

          {bookingsOpen && (
            <div>
              {([['list', '≡', 'List View'], ['calendar', '⊡', 'Calendar']] as const).map(([v, icon, label]) => (
                <button key={v} onClick={() => setView(v)} style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                  background: view === v ? 'rgba(255,255,255,0.07)' : 'transparent', border: 'none',
                  borderLeft: view === v ? '2px solid #fff' : '2px solid transparent',
                  padding: '9px 12px 9px 22px', cursor: 'pointer', textAlign: 'left' as const,
                  fontFamily: 'Inter, sans-serif', fontSize: 13,
                  color: view === v ? '#fff' : 'rgba(255,255,255,0.45)',
                }}>
                  <span style={{ width: 16, textAlign: 'center' as const, flexShrink: 0 }}>{icon}</span>{label}
                </button>
              ))}
            </div>
          )}

          <div style={{ height: 1, background: 'rgba(255,255,255,0.06)', margin: '12px 0' }} />

          {([['customers', '👤', 'Customers'], ['sets', '▦', 'Sets'], ['equipment', '🎥', 'Equipment'], ['emails', '✉', 'Emails'], ['profile', '⊙', 'Account']] as const).map(([v, icon, label]) => (
            <button key={v} onClick={() => setView(v)} style={{
              width: '100%', display: 'flex', alignItems: 'center', gap: 10,
              background: view === v ? 'rgba(255,255,255,0.07)' : 'transparent', border: 'none',
              borderLeft: view === v ? '2px solid #fff' : '2px solid transparent',
              padding: '9px 12px', cursor: 'pointer', textAlign: 'left' as const,
              fontFamily: 'Inter, sans-serif', fontSize: 13,
              color: view === v ? '#fff' : 'rgba(255,255,255,0.45)',
            }}>
              <span style={{ width: 16, textAlign: 'center' as const, flexShrink: 0, fontSize: v === 'customers' ? 12 : undefined }}>{icon}</span>{label}
            </button>
          ))}
        </nav>

        {/* Bottom actions */}
        <div style={{ padding: '16px 12px', borderTop: '1px solid rgba(255,255,255,0.06)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={() => { resetModal(); setShowManual(true) }} style={{
            background: '#fff', border: 'none', padding: '10px', cursor: 'pointer',
            fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: '#080808',
          }}>
            + NEW BOOKING
          </button>
          <button onClick={handleLogout} style={{
            background: 'transparent', border: '1px solid rgba(255,255,255,0.1)', padding: '9px',
            cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11,
            letterSpacing: '0.12em', color: 'rgba(255,255,255,0.35)',
          }}>
            LOG OUT
          </button>
        </div>
      </div>

      {/* ── MAIN CONTENT ─────────────────────────────────────────────────────── */}
      <div style={{ marginLeft: 220 }}>
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
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <span style={{ fontSize: 14, color: '#fff', fontWeight: 500 }}>{b.customers?.name || '—'}</span>
                            {b.customers?.banned && (
                              <span title="BANNED" style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: '#ef4444', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.4)', padding: '2px 6px' }}>BANNED</span>
                            )}
                            {!b.customers?.banned && b.customers?.status === 'warning' && (
                              <span title="WARNING" style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: '#f97316', background: 'rgba(249,115,22,0.12)', border: '1px solid rgba(249,115,22,0.4)', padding: '2px 6px' }}>⚠ WARNING</span>
                            )}
                          </div>
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
                            {(b.booking_add_ons?.length ?? 0) > 0 && (
                              <Detail label="GEAR TO PREP" value={b.booking_add_ons!.map(a => `${a.equipment?.name ?? 'Item'}${a.quantity > 1 ? ` ×${a.quantity}` : ''}${a.paid === false ? ' (UNPAID)' : ''}`).join(', ')} />
                            )}
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
                                background: b.customers?.banned
                                  ? 'rgba(239,68,68,0.18)'
                                  : b.customers?.status === 'warning'
                                    ? 'rgba(249,115,22,0.18)'
                                    : 'rgba(255,255,255,0.12)',
                                border: b.customers?.banned
                                  ? '1px solid rgba(239,68,68,0.6)'
                                  : b.customers?.status === 'warning'
                                    ? '1px solid rgba(249,115,22,0.6)'
                                    : '1px solid rgba(255,255,255,0.2)',
                                borderRadius: 2, padding: '4px 6px', cursor: 'pointer', overflow: 'hidden',
                              }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                {b.customers?.banned && <span style={{ fontSize: 8, lineHeight: 1 }}>🚫</span>}
                                {!b.customers?.banned && b.customers?.status === 'warning' && <span style={{ fontSize: 8, lineHeight: 1 }}>⚠️</span>}
                                <span style={{ fontSize: 10, color: '#fff', fontWeight: 500, lineHeight: 1.3 }}>
                                  {b.customers?.name || '—'}
                                </span>
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

            {/* Ban message */}
            <div style={{ background: 'rgba(239,68,68,0.05)', border: '1px solid rgba(239,68,68,0.15)', padding: '20px 24px', marginBottom: 32 }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.15em', color: 'rgba(239,68,68,0.7)', marginBottom: 8 }}>⊘ BANNED CUSTOMER MESSAGE</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 14, lineHeight: 1.5 }}>
                Shown on the booking page when a banned customer attempts to book. Keep it vague — don't mention the ban.
              </div>
              <textarea
                value={banMessage}
                onChange={e => { setBanMessage(e.target.value); setBanMessageSaved(false) }}
                rows={3}
                style={{ width: '100%', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 13, padding: '10px 12px', resize: 'vertical', outline: 'none', boxSizing: 'border-box' as const, lineHeight: 1.6 }}
              />
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 10 }}>
                <button
                  disabled={banMessageSaving}
                  onClick={async () => {
                    setBanMessageSaving(true)
                    const res = await fetch('/api/admin/settings', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ key: 'ban_message', value: banMessage }),
                    })
                    if (res.ok) setBanMessageSaved(true)
                    setBanMessageSaving(false)
                  }}
                  style={{ background: banMessageSaving ? 'rgba(255,255,255,0.1)' : '#fff', border: 'none', padding: '7px 18px', cursor: banMessageSaving ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: '#000' }}>
                  {banMessageSaving ? 'SAVING…' : 'SAVE'}
                </button>
                <button
                  onClick={() => { setBanMessage('We were unable to process your booking. Please contact the studio directly at (832) 408-1631.'); setBanMessageSaved(false) }}
                  style={{ background: 'transparent', border: 'none', padding: '7px 0', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.08em' }}>
                  RESET TO DEFAULT
                </button>
                {banMessageSaved && <span style={{ fontSize: 12, color: '#4ade80' }}>✓ Saved</span>}
              </div>
            </div>

            {/* Full-warehouse buyout rate */}
            <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', padding: '20px 24px', marginBottom: 32 }}>
              <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.5)', marginBottom: 8 }}>$ FULL STUDIO BUYOUT RATE</div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 14, lineHeight: 1.5 }}>
                Flat hourly rate charged for a full-warehouse takeover. Updates the /sets and booking pages instantly.
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 16, color: 'rgba(255,255,255,0.6)' }}>$</span>
                <input
                  type="number"
                  value={buyoutRate}
                  onChange={e => { setBuyoutRate(e.target.value); setBuyoutSaved(false) }}
                  style={{ width: 120, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 14, padding: '10px 12px', outline: 'none', boxSizing: 'border-box' as const }}
                />
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>/ hour</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 12 }}>
                <button
                  disabled={buyoutSaving}
                  onClick={async () => {
                    setBuyoutSaving(true)
                    const res = await fetch('/api/admin/settings', {
                      method: 'PATCH',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ key: 'buyout_rate', value: String(parseInt(buyoutRate, 10) || 0) }),
                    })
                    if (res.ok) setBuyoutSaved(true)
                    setBuyoutSaving(false)
                  }}
                  style={{ background: buyoutSaving ? 'rgba(255,255,255,0.1)' : '#fff', border: 'none', padding: '7px 18px', cursor: buyoutSaving ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: '#000' }}>
                  {buyoutSaving ? 'SAVING…' : 'SAVE'}
                </button>
                {buyoutSaved && <span style={{ fontSize: 12, color: '#4ade80' }}>✓ Saved</span>}
              </div>
            </div>

            {emailLoading ? (
              <div style={{ color: 'rgba(255,255,255,0.3)', fontSize: 13, padding: '40px 0' }}>Loading...</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                {emailSettings.map(s => {
                  const isEditing = emailEditKey === s.key
                  const isSaving  = emailSaving === s.key

                  const isPreviewing = emailPreviewKey === s.key

                  return (
                    <div key={s.key} style={{
                      background: '#0d0d0d',
                      border: isEditing || isPreviewing ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.06)',
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

                        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                          <button
                            onClick={() => {
                              setEmailPreviewKey(isPreviewing ? null : s.key)
                              if (!isPreviewing) setEmailEditKey(null)
                            }}
                            style={{
                              background: isPreviewing ? 'rgba(212,168,67,0.15)' : 'transparent',
                              border: isPreviewing ? '1px solid rgba(212,168,67,0.4)' : '1px solid rgba(255,255,255,0.15)',
                              color: isPreviewing ? '#d4a843' : 'rgba(255,255,255,0.35)',
                              padding: '6px 16px', cursor: 'pointer',
                              fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.1em',
                            }}>
                            {isPreviewing ? 'CLOSE' : 'PREVIEW'}
                          </button>
                          <button
                            onClick={() => {
                              if (isEditing) {
                                setEmailEditKey(null)
                              } else {
                                setEmailEditKey(s.key)
                                setEmailDraft({ subject: s.subject ?? '' })
                                setEmailPreviewKey(null)
                              }
                            }}
                            style={{
                              background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
                              color: isEditing ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.35)',
                              padding: '6px 16px', cursor: 'pointer',
                              fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.1em',
                            }}>
                            {isEditing ? 'CLOSE' : 'EDIT'}
                          </button>
                        </div>
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

                      {/* Preview panel */}
                      {isPreviewing && (
                        <div style={{ marginTop: 20, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 20 }}>
                          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', marginBottom: 12 }}>EMAIL PREVIEW — sample data</div>
                          <iframe
                            src={`/api/admin/email-preview/${s.key}`}
                            style={{
                              width: '100%',
                              height: 700,
                              border: 'none',
                              borderRadius: 6,
                              display: 'block',
                            }}
                            title={`Preview: ${s.label}`}
                          />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

          </div>
        )}

        {/* ── SETS MANAGER ──────────────────────────────────────────────── */}
        {view === 'sets' && (
          <div style={{ paddingBottom: 80 }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
              <div>
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, letterSpacing: '0.05em', marginBottom: 4 }}>SETS</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
                  Manage studio sets. Inactive sets are hidden from booking &amp; availability but still recognized by the Acuity sync — use them for promotional / seasonal sets.
                </div>
              </div>
              {setEditId === null && (
                <button onClick={startNewSet} style={{
                  background: '#fff', border: 'none', padding: '10px 18px', cursor: 'pointer', flexShrink: 0,
                  fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: '#080808',
                }}>
                  + NEW SET
                </button>
              )}
            </div>

            {setsError && (
              <div style={{ background: 'rgba(220,80,80,0.12)', border: '1px solid rgba(220,80,80,0.35)', color: '#f0a0a0', padding: '12px 16px', marginBottom: 20, fontSize: 13, lineHeight: 1.5 }}>
                {setsError}
              </div>
            )}

            {/* Create / edit form */}
            {setEditId !== null && (
              <div style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.1)', padding: 28, marginBottom: 28 }}>
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, letterSpacing: '0.05em', marginBottom: 20 }}>
                  {setEditId === 'new' ? 'NEW SET' : 'EDIT SET'}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>SET NAME</label>
                    <input value={setDraft.name} onChange={e => setSetDraft(d => ({ ...d, name: e.target.value }))}
                      placeholder="e.g. The Yard"
                      style={{ width: '100%', background: '#080808', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '10px 12px', fontFamily: 'Inter, sans-serif', fontSize: 14, boxSizing: 'border-box' }} />
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
                      For Acuity sync to match, this should read the same as the Acuity appointment type (casing doesn&apos;t matter).
                    </div>
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>DESCRIPTION</label>
                    <input value={setDraft.description} onChange={e => setSetDraft(d => ({ ...d, description: e.target.value }))}
                      placeholder="e.g. 12x15ft white cinderblock walls, large windows"
                      style={{ width: '100%', background: '#080808', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '10px 12px', fontFamily: 'Inter, sans-serif', fontSize: 14, boxSizing: 'border-box' }} />
                  </div>

                  <div>
                    <label style={labelStyle}>RATE / HOUR ($)</label>
                    <input type="number" value={setDraft.rate_per_hour} onChange={e => setSetDraft(d => ({ ...d, rate_per_hour: e.target.value }))}
                      style={{ width: '100%', background: '#080808', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '10px 12px', fontFamily: 'Inter, sans-serif', fontSize: 14, boxSizing: 'border-box' }} />
                  </div>

                  <div>
                    <label style={labelStyle}>MIN HOURS</label>
                    <input type="number" value={setDraft.min_hours} onChange={e => setSetDraft(d => ({ ...d, min_hours: e.target.value }))}
                      placeholder="1"
                      style={{ width: '100%', background: '#080808', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '10px 12px', fontFamily: 'Inter, sans-serif', fontSize: 14, boxSizing: 'border-box' }} />
                  </div>

                  <div>
                    <label style={labelStyle}>CAPACITY</label>
                    <input type="number" value={setDraft.capacity} onChange={e => setSetDraft(d => ({ ...d, capacity: e.target.value }))}
                      style={{ width: '100%', background: '#080808', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '10px 12px', fontFamily: 'Inter, sans-serif', fontSize: 14, boxSizing: 'border-box' }} />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                      <input type="checkbox" checked={setDraft.is_active} onChange={e => setSetDraft(d => ({ ...d, is_active: e.target.checked }))}
                        style={{ width: 16, height: 16, accentColor: '#d4a843' }} />
                      Active (bookable now)
                    </label>
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>FEATURES (comma-separated)</label>
                    <input value={setDraft.features} onChange={e => setSetDraft(d => ({ ...d, features: e.target.value }))}
                      placeholder="White cinderblock, Smooth walls, Large windows"
                      style={{ width: '100%', background: '#080808', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '10px 12px', fontFamily: 'Inter, sans-serif', fontSize: 14, boxSizing: 'border-box' }} />
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
                      Shown as tags on the set card.
                    </div>
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>URL SLUG</label>
                    <input value={setDraft.slug} onChange={e => setSetDraft(d => ({ ...d, slug: e.target.value }))}
                      placeholder="e.g. the-yard"
                      style={{ width: '100%', background: '#080808', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '10px 12px', fontFamily: 'Inter, sans-serif', fontSize: 14, boxSizing: 'border-box' }} />
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
                      Used in booking links (lowercase, hyphens, no spaces). Don&apos;t change this on an existing set unless you know what you&apos;re doing — it&apos;s how bookings and the calendar identify the set.
                    </div>
                  </div>

                  <div>
                    <label style={labelStyle}>DIMENSIONS</label>
                    <input value={setDraft.dimensions} onChange={e => setSetDraft(d => ({ ...d, dimensions: e.target.value }))}
                      placeholder="e.g. 12 × 15 ft"
                      style={{ width: '100%', background: '#080808', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '10px 12px', fontFamily: 'Inter, sans-serif', fontSize: 14, boxSizing: 'border-box' }} />
                  </div>

                  <div>
                    <label style={labelStyle}>DISPLAY ORDER</label>
                    <input type="number" value={setDraft.sort_order} onChange={e => setSetDraft(d => ({ ...d, sort_order: e.target.value }))}
                      placeholder="100"
                      style={{ width: '100%', background: '#080808', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '10px 12px', fontFamily: 'Inter, sans-serif', fontSize: 14, boxSizing: 'border-box' }} />
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>Lower numbers appear first.</div>
                  </div>

                  <div>
                    <label style={labelStyle}>CATEGORY</label>
                    <select value={setDraft.category} onChange={e => setSetDraft(d => ({ ...d, category: e.target.value }))}
                      style={{ width: '100%', background: '#080808', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '10px 12px', fontFamily: 'Inter, sans-serif', fontSize: 14, boxSizing: 'border-box' }}>
                      <option value="standard">Standard ($40/hr grid)</option>
                      <option value="premium">Premium (featured)</option>
                    </select>
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>PHOTO URL</label>
                    <input value={setDraft.photo_url} onChange={e => setSetDraft(d => ({ ...d, photo_url: e.target.value }))}
                      placeholder="/images/sets/your-set.jpg"
                      style={{ width: '100%', background: '#080808', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '10px 12px', fontFamily: 'Inter, sans-serif', fontSize: 14, boxSizing: 'border-box' }} />
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
                      Leave blank to show the accent gradient instead.
                    </div>
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>ACCENT GRADIENT (CSS)</label>
                    <input value={setDraft.accent_gradient} onChange={e => setSetDraft(d => ({ ...d, accent_gradient: e.target.value }))}
                      placeholder="linear-gradient(135deg, #1c1c1c 0%, #2a2a2a 100%)"
                      style={{ width: '100%', background: '#080808', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '10px 12px', fontFamily: 'Inter, sans-serif', fontSize: 14, boxSizing: 'border-box' }} />
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 6 }}>
                      Fallback background shown behind / instead of the photo.
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <button onClick={saveSet} disabled={setsSaving} style={{
                    background: '#fff', border: 'none', padding: '11px 24px', cursor: setsSaving ? 'default' : 'pointer', opacity: setsSaving ? 0.6 : 1,
                    fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: '#080808',
                  }}>
                    {setsSaving ? 'SAVING…' : 'SAVE SET'}
                  </button>
                  <button onClick={cancelEditSet} disabled={setsSaving} style={{
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', padding: '11px 24px', cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.5)',
                  }}>
                    CANCEL
                  </button>
                </div>
              </div>
            )}

            {/* List */}
            {setsLoading ? (
              <div style={{ ...labelStyle, textAlign: 'center', padding: 60 }}>LOADING…</div>
            ) : setsList.length === 0 ? (
              <div style={{ ...labelStyle, textAlign: 'center', padding: 60 }}>NO SETS YET</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                {setsList.map(s => (
                  <div key={s.id} style={{
                    background: '#0d0d0d', padding: '18px 24px', display: 'flex', alignItems: 'center', gap: 20,
                    opacity: s.is_active ? 1 : 0.55,
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 4 }}>
                        <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, letterSpacing: '0.03em' }}>{s.name}</span>
                        <span style={{
                          fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', padding: '3px 8px',
                          background: s.is_active ? 'rgba(120,200,120,0.15)' : 'rgba(255,255,255,0.08)',
                          color: s.is_active ? '#8fd49a' : 'rgba(255,255,255,0.45)',
                        }}>
                          {s.is_active ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                      </div>
                      <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>
                        ${s.rate_per_hour}/hr · {s.capacity} people{s.min_hours ? ` · ${s.min_hours}hr min` : ''}
                      </div>
                      {s.description && (
                        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>{s.description}</div>
                      )}
                    </div>
                    <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                      <button onClick={() => toggleSetActive(s)} disabled={setsBusyId === s.id} style={{
                        background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', padding: '7px 14px', cursor: 'pointer',
                        fontFamily: 'Inter, sans-serif', fontSize: 10, letterSpacing: '0.1em',
                        color: s.is_active ? 'rgba(255,255,255,0.45)' : '#d4a843',
                      }}>
                        {setsBusyId === s.id ? '…' : s.is_active ? 'DEACTIVATE' : 'ACTIVATE'}
                      </button>
                      <button onClick={() => startEditSet(s)} style={{
                        background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', padding: '7px 14px', cursor: 'pointer',
                        fontFamily: 'Inter, sans-serif', fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.55)',
                      }}>
                        EDIT
                      </button>
                      <button onClick={() => deleteSet(s)} disabled={setsBusyId === s.id} style={{
                        background: 'transparent', border: '1px solid rgba(220,80,80,0.3)', padding: '7px 14px', cursor: 'pointer',
                        fontFamily: 'Inter, sans-serif', fontSize: 10, letterSpacing: '0.1em', color: 'rgba(220,120,120,0.7)',
                      }}>
                        DELETE
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── EQUIPMENT MANAGER ─────────────────────────────────────────── */}
        {view === 'equipment' && (
          <div style={{ paddingBottom: 80 }}>

            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
              <div>
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, letterSpacing: '0.05em', marginBottom: 4 }}>EQUIPMENT</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
                  Manage your gear inventory. &quot;In use&quot; shows units on a booking happening right now. Unavailable items are hidden from customer rentals.
                </div>
              </div>
              {equipEditId === null && (
                <button onClick={startNewEquip} style={{
                  background: '#fff', border: 'none', padding: '10px 18px', cursor: 'pointer', flexShrink: 0,
                  fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: '#080808',
                }}>
                  + NEW ITEM
                </button>
              )}
            </div>

            {equipError && (
              <div style={{ background: 'rgba(220,80,80,0.12)', border: '1px solid rgba(220,80,80,0.35)', color: '#f0a0a0', padding: '12px 16px', marginBottom: 20, fontSize: 13, lineHeight: 1.5 }}>
                {equipError}
              </div>
            )}

            {/* Create / edit form */}
            {equipEditId !== null && (
              <div style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.1)', padding: 28, marginBottom: 28 }}>
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, letterSpacing: '0.05em', marginBottom: 20 }}>
                  {equipEditId === 'new' ? 'NEW ITEM' : 'EDIT ITEM'}
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 18, marginBottom: 18 }}>
                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>NAME</label>
                    <input value={equipDraft.name} onChange={e => setEquipDraft(d => ({ ...d, name: e.target.value }))}
                      placeholder="e.g. Aputure LS 600d Daylight LED Monolight"
                      style={{ width: '100%', background: '#080808', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '10px 12px', fontFamily: 'Inter, sans-serif', fontSize: 14, boxSizing: 'border-box' }} />
                  </div>

                  <div>
                    <label style={labelStyle}>CATEGORY</label>
                    <select value={equipDraft.category} onChange={e => setEquipDraft(d => ({ ...d, category: e.target.value }))}
                      style={{ width: '100%', background: '#080808', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '10px 12px', fontFamily: 'Inter, sans-serif', fontSize: 14, boxSizing: 'border-box', appearance: 'none' as const }}>
                      {EQUIP_CATEGORIES.map(c => <option key={c.value} value={c.value} style={{ background: '#111' }}>{c.label}</option>)}
                    </select>
                  </div>

                  <div>
                    <label style={labelStyle}>RATE ($ / booking)</label>
                    <input type="number" value={equipDraft.rate} onChange={e => setEquipDraft(d => ({ ...d, rate: e.target.value }))}
                      style={{ width: '100%', background: '#080808', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '10px 12px', fontFamily: 'Inter, sans-serif', fontSize: 14, boxSizing: 'border-box' }} />
                  </div>

                  <div>
                    <label style={labelStyle}>QUANTITY OWNED</label>
                    <input type="number" min={0} value={equipDraft.quantity} onChange={e => setEquipDraft(d => ({ ...d, quantity: e.target.value }))}
                      style={{ width: '100%', background: '#080808', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '10px 12px', fontFamily: 'Inter, sans-serif', fontSize: 14, boxSizing: 'border-box' }} />
                  </div>

                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 20 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>
                      <input type="checkbox" checked={equipDraft.is_available} onChange={e => setEquipDraft(d => ({ ...d, is_available: e.target.checked }))}
                        style={{ width: 16, height: 16, accentColor: '#d4a843' }} />
                      Available
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>
                      <input type="checkbox" checked={equipDraft.allow_offsite} onChange={e => setEquipDraft(d => ({ ...d, allow_offsite: e.target.checked }))}
                        style={{ width: 16, height: 16, accentColor: '#d4a843' }} />
                      Off-site OK
                    </label>
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>DESCRIPTION (shown to customers)</label>
                    <input value={equipDraft.description} onChange={e => setEquipDraft(d => ({ ...d, description: e.target.value }))}
                      placeholder="What it is + key specs"
                      style={{ width: '100%', background: '#080808', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '10px 12px', fontFamily: 'Inter, sans-serif', fontSize: 14, boxSizing: 'border-box' }} />
                  </div>

                  <div style={{ gridColumn: '1 / -1' }}>
                    <label style={labelStyle}>PHOTO URL (shown on the gear catalog)</label>
                    <input value={equipDraft.image_url} onChange={e => setEquipDraft(d => ({ ...d, image_url: e.target.value }))}
                      placeholder="https://…/your-photo.jpg  (or upload to public/images/equipment and use /images/equipment/name.jpg)"
                      style={{ width: '100%', background: '#080808', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '10px 12px', fontFamily: 'Inter, sans-serif', fontSize: 14, boxSizing: 'border-box' }} />
                    {equipDraft.image_url && (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={equipDraft.image_url} alt="" style={{ marginTop: 10, maxHeight: 90, borderRadius: 4, border: '1px solid rgba(255,255,255,0.1)' }} />
                    )}
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 12 }}>
                  <button onClick={saveEquip} disabled={equipSaving} style={{
                    background: '#fff', border: 'none', padding: '11px 24px', cursor: equipSaving ? 'default' : 'pointer', opacity: equipSaving ? 0.6 : 1,
                    fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: '#080808',
                  }}>
                    {equipSaving ? 'SAVING…' : 'SAVE ITEM'}
                  </button>
                  <button onClick={cancelEditEquip} disabled={equipSaving} style={{
                    background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', padding: '11px 24px', cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.5)',
                  }}>
                    CANCEL
                  </button>
                </div>
              </div>
            )}

            {/* List grouped by category */}
            {equipLoading ? (
              <div style={{ ...labelStyle, textAlign: 'center', padding: 60 }}>LOADING…</div>
            ) : equipList.length === 0 ? (
              <div style={{ ...labelStyle, textAlign: 'center', padding: 60 }}>NO EQUIPMENT YET</div>
            ) : (
              EQUIP_CATEGORIES.map(cat => {
                const items = equipList.filter(e => e.category === cat.value)
                if (items.length === 0) return null
                return (
                  <div key={cat.value} style={{ marginBottom: 32 }}>
                    <div style={{ ...labelStyle, marginBottom: 12, color: 'rgba(255,255,255,0.5)' }}>{cat.label.toUpperCase()}</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {items.map(e => (
                        <div key={e.id} style={{
                          background: '#0d0d0d', padding: '16px 24px', display: 'flex', alignItems: 'center', gap: 20,
                          opacity: e.is_available ? 1 : 0.5,
                        }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                              <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 14, fontWeight: 500 }}>{e.name}</span>
                              {!e.is_available && (
                                <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', padding: '3px 8px', background: 'rgba(255,255,255,0.08)', color: 'rgba(255,255,255,0.45)' }}>UNAVAILABLE</span>
                              )}
                              {e.allow_offsite && (
                                <span style={{ fontSize: 9, fontWeight: 600, letterSpacing: '0.12em', padding: '3px 8px', background: 'rgba(212,168,67,0.15)', color: '#d4a843' }}>OFF-SITE</span>
                              )}
                            </div>
                            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>
                              ${e.rate} · {e.quantity} owned · <span style={{ color: e.in_use_now > 0 ? '#d4a843' : 'rgba(255,255,255,0.4)' }}>{e.in_use_now} in use now</span> · {e.available_now} free
                            </div>
                          </div>
                          <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                            <button onClick={() => toggleEquipAvailable(e)} disabled={equipBusyId === e.id} style={{
                              background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', padding: '7px 14px', cursor: 'pointer',
                              fontFamily: 'Inter, sans-serif', fontSize: 10, letterSpacing: '0.1em',
                              color: e.is_available ? 'rgba(255,255,255,0.45)' : '#d4a843',
                            }}>
                              {equipBusyId === e.id ? '…' : e.is_available ? 'DISABLE' : 'ENABLE'}
                            </button>
                            <button onClick={() => startEditEquip(e)} style={{
                              background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', padding: '7px 14px', cursor: 'pointer',
                              fontFamily: 'Inter, sans-serif', fontSize: 10, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.55)',
                            }}>
                              EDIT
                            </button>
                            <button onClick={() => deleteEquip(e)} disabled={equipBusyId === e.id} style={{
                              background: 'transparent', border: '1px solid rgba(220,80,80,0.3)', padding: '7px 14px', cursor: 'pointer',
                              fontFamily: 'Inter, sans-serif', fontSize: 10, letterSpacing: '0.1em', color: 'rgba(220,120,120,0.7)',
                            }}>
                              DELETE
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              })
            )}
          </div>
        )}

        {/* ── CUSTOMERS ─────────────────────────────────────────────────── */}
        {view === 'customers' && (
          <div style={{ paddingBottom: 80 }}>

            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 28 }}>
              <div>
                <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, letterSpacing: '0.05em', marginBottom: 4 }}>CUSTOMERS</div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
                  {custTotal > 0 ? `${custTotal} total` : 'No customers yet'}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  onClick={async () => {
                    setDupLoading(true)
                    setDupPanelOpen(true)
                    setDupMergeResult({})
                    const res = await fetch('/api/admin/customers/duplicates')
                    const data = await res.json()
                    setDupGroups(data.groups ?? [])
                    // Default: oldest record is primary for each group
                    const defaults: Record<number, string> = {}
                    ;(data.groups ?? []).forEach((g: any, i: number) => { defaults[i] = g.members[0].id })
                    setDupPrimaryMap(defaults)
                    setDupLoading(false)
                  }}
                  style={{
                    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                    padding: '10px 18px', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                    fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.6)',
                  }}>
                  ⊞ FIND DUPLICATES
                </button>
                <button
                  onClick={async () => {
                    setCustImporting(true)
                    setCustImportResult(null)
                    const res = await fetch('/api/admin/customers/import', { method: 'POST' })
                    const data = await res.json()
                    setCustImportResult(data)
                    setCustImporting(false)
                    fetchCustomers(custSearch, custFilter, custPage)
                  }}
                  disabled={custImporting}
                  style={{
                    background: custImporting ? 'rgba(255,255,255,0.08)' : '#d4a843',
                    border: 'none', padding: '10px 20px', cursor: custImporting ? 'default' : 'pointer',
                    fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em',
                    color: custImporting ? 'rgba(255,255,255,0.3)' : '#000',
                  }}>
                  {custImporting ? 'IMPORTING...' : '↓ IMPORT FROM SQUARE + ACUITY'}
                </button>
              </div>
            </div>

            {/* Duplicate consolidation panel */}
            {dupPanelOpen && (
              <div style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.1)', marginBottom: 24 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.5)' }}>
                    DUPLICATE CUSTOMERS {!dupLoading && `— ${dupGroups.length} group${dupGroups.length !== 1 ? 's' : ''} found`}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    {!dupLoading && dupGroups.length > 0 && (
                      <button
                        disabled={dupMergingAll}
                        onClick={async () => {
                          if (!confirm(`Merge all ${dupGroups.length} duplicate groups? The oldest record in each group will be kept. This cannot be undone.`)) return
                          setDupMergingAll(true)
                          const results: Record<number, string> = {}
                          for (let gi = 0; gi < dupGroups.length; gi++) {
                            if (dupMergeResult[gi]) continue // already merged
                            const group = dupGroups[gi]
                            const primaryId    = dupPrimaryMap[gi] ?? group.members[0].id
                            const duplicateIds = group.members.filter((m: any) => m.id !== primaryId).map((m: any) => m.id)
                            const res = await fetch('/api/admin/customers/merge', {
                              method: 'POST',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ primaryId, duplicateIds }),
                            })
                            const data = await res.json()
                            results[gi] = data.success
                              ? `Merged ${data.mergedCount} record${data.mergedCount !== 1 ? 's' : ''} into primary`
                              : `Error: ${data.errors?.join(', ')}`
                          }
                          setDupMergeResult(r => ({ ...r, ...results }))
                          setDupMergingAll(false)
                          fetchCustomers(custSearch, custFilter, custPage)
                        }}
                        style={{
                          background: dupMergingAll ? 'rgba(255,255,255,0.06)' : '#fff',
                          border: 'none', padding: '7px 16px', cursor: dupMergingAll ? 'default' : 'pointer',
                          fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em',
                          color: dupMergingAll ? 'rgba(255,255,255,0.3)' : '#000',
                        }}>
                        {dupMergingAll ? 'MERGING ALL…' : `MERGE ALL (${dupGroups.length})`}
                      </button>
                    )}
                    <button onClick={() => setDupPanelOpen(false)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 18 }}>✕</button>
                  </div>
                </div>

                {dupLoading ? (
                  <div style={{ padding: '32px 20px', fontSize: 12, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em' }}>SCANNING…</div>
                ) : dupGroups.length === 0 ? (
                  <div style={{ padding: '32px 20px', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>No duplicates found.</div>
                ) : dupGroups.map((group, gi) => {
                  const merged = dupMergeResult[gi]
                  return (
                    <div key={gi} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)', padding: '16px 20px', opacity: merged ? 0.4 : 1 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.25)', marginBottom: 10 }}>
                        MATCHED BY {group.reason.toUpperCase()} — {group.members.length} RECORDS
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column' as const, gap: 6, marginBottom: 12 }}>
                        {group.members.map((m: any) => {
                          const isPrimary = dupPrimaryMap[gi] === m.id
                          return (
                            <div key={m.id} onClick={() => setDupPrimaryMap(p => ({ ...p, [gi]: m.id }))}
                              style={{
                                display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', cursor: 'pointer',
                                background: isPrimary ? 'rgba(212,168,67,0.08)' : 'rgba(255,255,255,0.03)',
                                border: `1px solid ${isPrimary ? 'rgba(212,168,67,0.4)' : 'rgba(255,255,255,0.06)'}`,
                              }}>
                              <div style={{ width: 14, height: 14, borderRadius: '50%', border: `2px solid ${isPrimary ? '#d4a843' : 'rgba(255,255,255,0.2)'}`, background: isPrimary ? '#d4a843' : 'transparent', flexShrink: 0 }} />
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                                  <span style={{ fontSize: 13, color: '#fff', fontWeight: 500 }}>{m.name}</span>
                                  {isPrimary && <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: '#d4a843', background: 'rgba(212,168,67,0.12)', border: '1px solid rgba(212,168,67,0.3)', padding: '1px 6px' }}>KEEP</span>}
                                </div>
                                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{m.email} {m.phone ? `· ${m.phone}` : ''}</div>
                              </div>
                              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)', textAlign: 'right' as const, flexShrink: 0 }}>
                                {m.bookingCount} booking{m.bookingCount !== 1 ? 's' : ''}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        {merged ? (
                          <span style={{ fontSize: 11, color: '#4ade80' }}>✓ {merged}</span>
                        ) : (
                          <button
                            disabled={dupMerging === gi}
                            onClick={async () => {
                              setDupMerging(gi)
                              const primaryId  = dupPrimaryMap[gi]
                              const duplicateIds = group.members.filter((m: any) => m.id !== primaryId).map((m: any) => m.id)
                              const res = await fetch('/api/admin/customers/merge', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ primaryId, duplicateIds }),
                              })
                              const data = await res.json()
                              if (data.success) {
                                setDupMergeResult(r => ({ ...r, [gi]: `Merged ${data.mergedCount} record${data.mergedCount !== 1 ? 's' : ''} into primary` }))
                                fetchCustomers(custSearch, custFilter, custPage)
                              } else {
                                setDupMergeResult(r => ({ ...r, [gi]: `Error: ${data.errors?.join(', ')}` }))
                              }
                              setDupMerging(null)
                            }}
                            style={{
                              background: '#fff', border: 'none', padding: '7px 18px', cursor: dupMerging === gi ? 'default' : 'pointer',
                              fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 700, letterSpacing: '0.12em', color: '#000',
                              opacity: dupMerging === gi ? 0.5 : 1,
                            }}>
                            {dupMerging === gi ? 'MERGING…' : 'MERGE →'}
                          </button>
                        )}
                        <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
                          Click a record to set it as the one to keep · All bookings + notes will be consolidated
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}

            {custImportResult && (
              <div style={{ background: 'rgba(74,222,128,0.07)', border: '1px solid rgba(74,222,128,0.2)', padding: '12px 16px', marginBottom: 20, fontSize: 13, color: '#4ade80', fontFamily: 'Inter, sans-serif' }}>
                ✓ Imported {custImportResult.totalUpserted} customers — Square + Acuity merged by email
              </div>
            )}

            {/* Search + filter */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16, alignItems: 'center' }}>
              <input
                placeholder="Search name, email, phone…"
                value={custSearch}
                onChange={e => {
                  setCustSearch(e.target.value)
                  if (custSearchTimer.current) clearTimeout(custSearchTimer.current)
                  custSearchTimer.current = setTimeout(() => {
                    setCustPage(1)
                    fetchCustomers(e.target.value, custFilter, 1)
                  }, 350)
                }}
                style={{ ...inputStyle, maxWidth: 320, padding: '9px 14px' }}
              />
              <div style={{ display: 'flex', gap: 4 }}>
                {(['all', 'vip', 'warning', 'banned'] as const).map(f => (
                  <button key={f} onClick={() => { setCustFilter(f); setCustPage(1); fetchCustomers(custSearch, f, 1) }}
                    style={{
                      padding: '7px 14px', border: 'none', cursor: 'pointer',
                      fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.1em', fontWeight: 500,
                      background: custFilter === f ? '#fff' : 'rgba(255,255,255,0.06)',
                      color: custFilter === f ? '#000' : 'rgba(255,255,255,0.45)',
                    }}>
                    {f.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            {/* Table */}
            <div style={{ border: '1px solid rgba(255,255,255,0.07)', overflow: 'hidden' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 80px 80px 100px', background: 'rgba(255,255,255,0.03)', padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
                {['NAME', 'EMAIL', 'PHONE', 'BOOKINGS', 'SPEND', 'STATUS'].map(h => (
                  <div key={h} style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)' }}>{h}</div>
                ))}
              </div>

              {custLoading ? (
                <div style={{ padding: '40px 16px', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontFamily: 'Inter, sans-serif', fontSize: 13 }}>Loading…</div>
              ) : custList.length === 0 ? (
                <div style={{ padding: '40px 16px', textAlign: 'center', color: 'rgba(255,255,255,0.25)', fontFamily: 'Inter, sans-serif', fontSize: 13 }}>No customers found</div>
              ) : custList.map(c => {
                const statusColor: Record<string, string> = { vip: '#d4a843', warning: '#f97316', banned: '#ef4444', regular: 'rgba(255,255,255,0.25)' }
                const statusBg:    Record<string, string> = { vip: 'rgba(212,168,67,0.1)', warning: 'rgba(249,115,22,0.1)', banned: 'rgba(239,68,68,0.1)', regular: 'rgba(255,255,255,0.04)' }
                const s = c.banned ? 'banned' : (c.status ?? 'regular')
                return (
                  <div key={c.id}
                    onClick={() => { setCustDetail(null); fetchCustomerDetail(c.id) }}
                    style={{
                      display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 80px 80px 100px',
                      padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,0.04)',
                      cursor: 'pointer', alignItems: 'center',
                      background: custDetail?.id === c.id ? 'rgba(255,255,255,0.05)' : 'transparent',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.04)')}
                    onMouseLeave={e => (e.currentTarget.style.background = custDetail?.id === c.id ? 'rgba(255,255,255,0.05)' : 'transparent')}
                  >
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#fff', fontWeight: 500 }}>{c.name || '—'}</div>
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.5)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</div>
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>{c.phone || '—'}</div>
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>{c.totalBookings}</div>
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.55)' }}>${c.totalSpend.toLocaleString()}</div>
                    <div>
                      <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', padding: '3px 8px', background: statusBg[s] ?? statusBg.regular, color: statusColor[s] ?? statusColor.regular, border: `1px solid ${statusColor[s] ?? statusColor.regular}30` }}>
                        {s.toUpperCase()}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Pagination */}
            {custTotal > 50 && (
              <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 24 }}>
                <button onClick={() => { setCustPage(p => Math.max(1, p - 1)); fetchCustomers(custSearch, custFilter, Math.max(1, custPage - 1)) }}
                  disabled={custPage === 1}
                  style={{ padding: '7px 16px', background: 'rgba(255,255,255,0.06)', border: 'none', color: custPage === 1 ? 'rgba(255,255,255,0.2)' : '#fff', cursor: custPage === 1 ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 12 }}>
                  ← Prev
                </button>
                <span style={{ padding: '7px 12px', fontSize: 12, color: 'rgba(255,255,255,0.4)', fontFamily: 'Inter, sans-serif' }}>
                  Page {custPage} of {Math.ceil(custTotal / 50)}
                </span>
                <button onClick={() => { setCustPage(p => p + 1); fetchCustomers(custSearch, custFilter, custPage + 1) }}
                  disabled={custPage >= Math.ceil(custTotal / 50)}
                  style={{ padding: '7px 16px', background: 'rgba(255,255,255,0.06)', border: 'none', color: custPage >= Math.ceil(custTotal / 50) ? 'rgba(255,255,255,0.2)' : '#fff', cursor: custPage >= Math.ceil(custTotal / 50) ? 'default' : 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 12 }}>
                  Next →
                </button>
              </div>
            )}
          </div>
        )}

        {/* ── PROFILE ───────────────────────────────────────────────────── */}
        {view === 'profile' && (
          <div style={{ maxWidth: 600, paddingBottom: 80 }}>
            <div style={{ marginBottom: 40 }}>
              <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, letterSpacing: '0.05em', marginBottom: 8 }}>
                ACCOUNT
              </div>
              <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6 }}>
                Manage your admin profile and authentication settings.
              </p>
            </div>

            {/* ── Identity card ── */}
            <div style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.08)', padding: '28px 32px', marginBottom: 2, display: 'flex', alignItems: 'center', gap: 24 }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#d4a843', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, color: '#000', letterSpacing: '0.05em' }}>TT</span>
              </div>
              <div>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 16, fontWeight: 600, color: '#fff', marginBottom: 4 }}>Teddy Tran</div>
                <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 8 }}>teddytran@madekulture.com</div>
                <span style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, letterSpacing: '0.12em', color: '#d4a843', background: 'rgba(212,168,67,0.1)', border: '1px solid rgba(212,168,67,0.25)', padding: '3px 10px' }}>STUDIO OWNER</span>
              </div>
            </div>

            {/* ── Auth methods ── */}
            <div style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.08)', borderTop: 'none', padding: '24px 32px', marginBottom: 24 }}>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.35)', marginBottom: 16 }}>SIGN-IN METHODS</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" style={{ flexShrink: 0 }}>
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  <div>
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#fff' }}>Google</div>
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>teddytran@madekulture.com</div>
                  </div>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: '#4ade80', letterSpacing: '0.1em' }}>ACTIVE</span>
                </div>
                <div style={{ height: 1, background: 'rgba(255,255,255,0.06)' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0110 0v4"/>
                  </svg>
                  <div>
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#fff' }}>Password</div>
                    <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>Admin password set via environment</div>
                  </div>
                  <span style={{ marginLeft: 'auto', fontSize: 10, color: '#4ade80', letterSpacing: '0.1em' }}>ACTIVE</span>
                </div>
              </div>
            </div>

            {/* ── Change password ── */}
            <div style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.08)', padding: '24px 32px', marginBottom: 2 }}>
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.35)', marginBottom: 20 }}>CHANGE PASSWORD</div>

              {profilePwMsg && (
                <div style={{
                  marginBottom: 16, padding: '10px 14px', fontSize: 13, fontFamily: 'Inter, sans-serif',
                  background: profilePwMsg.type === 'success' ? 'rgba(74,222,128,0.08)' : 'rgba(255,107,107,0.08)',
                  border: `1px solid ${profilePwMsg.type === 'success' ? 'rgba(74,222,128,0.25)' : 'rgba(255,107,107,0.25)'}`,
                  color: profilePwMsg.type === 'success' ? '#4ade80' : '#ff6b6b',
                }}>
                  {profilePwMsg.text}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {/* Current password */}
                <div>
                  <label style={labelStyle}>CURRENT PASSWORD</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={profileShowOld ? 'text' : 'password'}
                      value={profilePwOld}
                      onChange={e => setProfilePwOld(e.target.value)}
                      placeholder="Enter current password"
                      style={{ ...inputStyle, paddingRight: 44 }}
                    />
                    <button type="button" onClick={() => setProfileShowOld(v => !v)} tabIndex={-1}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: 4 }}>
                      {profileShowOld
                        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      }
                    </button>
                  </div>
                </div>

                {/* New password */}
                <div>
                  <label style={labelStyle}>NEW PASSWORD</label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={profileShowNew ? 'text' : 'password'}
                      value={profilePwNew}
                      onChange={e => setProfilePwNew(e.target.value)}
                      placeholder="Enter new password"
                      style={{ ...inputStyle, paddingRight: 44 }}
                    />
                    <button type="button" onClick={() => setProfileShowNew(v => !v)} tabIndex={-1}
                      style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'transparent', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,0.3)', padding: 4 }}>
                      {profileShowNew
                        ? <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                        : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      }
                    </button>
                  </div>
                </div>

                {/* Confirm */}
                <div>
                  <label style={labelStyle}>CONFIRM NEW PASSWORD</label>
                  <input
                    type="password"
                    value={profilePwConfirm}
                    onChange={e => setProfilePwConfirm(e.target.value)}
                    placeholder="Repeat new password"
                    style={inputStyle}
                  />
                </div>

                <button
                  disabled={profilePwLoading || !profilePwOld || !profilePwNew || !profilePwConfirm}
                  onClick={async () => {
                    if (profilePwNew !== profilePwConfirm) {
                      setProfilePwMsg({ type: 'error', text: 'New passwords do not match.' }); return
                    }
                    if (profilePwNew.length < 8) {
                      setProfilePwMsg({ type: 'error', text: 'New password must be at least 8 characters.' }); return
                    }
                    setProfilePwLoading(true); setProfilePwMsg(null)
                    const res = await fetch('/api/admin/auth/change-password', {
                      method: 'POST',
                      headers: { 'content-type': 'application/json' },
                      body: JSON.stringify({ currentPassword: profilePwOld, newPassword: profilePwNew }),
                    })
                    const data = await res.json()
                    if (res.ok) {
                      setProfilePwMsg({ type: 'success', text: 'Password updated successfully. You\'ll use the new password on next login.' })
                      setProfilePwOld(''); setProfilePwNew(''); setProfilePwConfirm('')
                    } else {
                      setProfilePwMsg({ type: 'error', text: data.error || 'Failed to change password.' })
                    }
                    setProfilePwLoading(false)
                  }}
                  style={{
                    background: profilePwOld && profilePwNew && profilePwConfirm ? '#fff' : 'rgba(255,255,255,0.08)',
                    color: profilePwOld && profilePwNew && profilePwConfirm ? '#080808' : 'rgba(255,255,255,0.2)',
                    border: 'none', padding: '12px 24px', cursor: profilePwLoading ? 'default' : 'pointer',
                    fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.15em',
                    alignSelf: 'flex-start',
                  }}>
                  {profilePwLoading ? 'UPDATING...' : 'UPDATE PASSWORD'}
                </button>
              </div>
            </div>

            {/* ── Magic link / forgot ── */}
            <div style={{ background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.08)', borderTop: 'none', padding: '20px 32px', marginBottom: 24 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: '#fff', marginBottom: 4 }}>Forgot your password?</div>
                  <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>Send a one-time sign-in link to teddytran@madekulture.com</div>
                </div>
                {profileMagicSent ? (
                  <span style={{ fontSize: 12, color: '#4ade80', whiteSpace: 'nowrap' }}>✓ Email sent</span>
                ) : (
                  <button
                    disabled={profileMagicLoading}
                    onClick={async () => {
                      setProfileMagicLoading(true)
                      await fetch('/api/admin/auth/magic', { method: 'POST' })
                      setProfileMagicSent(true)
                      setProfileMagicLoading(false)
                    }}
                    style={{
                      background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', padding: '8px 18px',
                      cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 11, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.55)',
                      whiteSpace: 'nowrap', flexShrink: 0,
                    }}>
                    {profileMagicLoading ? 'SENDING...' : 'SEND LINK'}
                  </button>
                )}
              </div>
            </div>

          </div>
        )}

      </div>
      </div>{/* end main content */}

      {/* CUSTOMER DETAIL PANEL */}
      {custDetail && view === 'customers' && (
        <div style={{
          position: 'fixed', right: 0, top: 0, bottom: 0, width: 420,
          background: '#0d0d0d', borderLeft: '1px solid rgba(255,255,255,0.08)',
          overflowY: 'auto', zIndex: 100, padding: '28px 28px 40px',
          fontFamily: 'Inter, sans-serif',
        }}>
          {custDetailLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'rgba(255,255,255,0.3)', fontSize: 13 }}>Loading…</div>
          ) : (
            <>
              {/* Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
                <div>
                  <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, letterSpacing: '0.05em' }}>
                    {custDetail.name || custDetail.email}
                  </div>
                  {(() => {
                    const statusColor: Record<string, string> = { vip: '#d4a843', warning: '#f97316', banned: '#ef4444', regular: 'rgba(255,255,255,0.25)' }
                    const s = custDetail.banned ? 'banned' : custDetail.status
                    return (
                      <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', padding: '2px 8px', background: `${statusColor[s] ?? statusColor.regular}18`, color: statusColor[s] ?? statusColor.regular, border: `1px solid ${statusColor[s] ?? statusColor.regular}40`, marginTop: 4, display: 'inline-block' }}>
                        {s.toUpperCase()}
                      </span>
                    )
                  })()}
                </div>
                <button onClick={() => setCustDetail(null)} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.4)', cursor: 'pointer', fontSize: 20, lineHeight: 1 }}>&#x2715;</button>
              </div>

              {/* Info + Edit */}
              {custEditMode ? (
                <div style={{ background: 'rgba(255,255,255,0.04)', padding: '16px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {(['name', 'email', 'phone'] as const).map(field => (
                    <div key={field}>
                      <label style={labelStyle}>{field.toUpperCase()}</label>
                      <input value={custEditDraft[field]} onChange={e => setCustEditDraft(d => ({ ...d, [field]: e.target.value }))}
                        style={{ ...inputStyle, fontSize: 13, padding: '8px 12px' }} />
                    </div>
                  ))}
                  <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                    <button onClick={async () => {
                      setCustEditSaving(true)
                      const res = await fetch(`/api/admin/customers/${custDetail.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(custEditDraft) })
                      if (res.ok) {
                        const data = await res.json()
                        setCustDetail(d => d ? { ...d, ...data.customer } : d)
                        setCustList(list => list.map(c => c.id === custDetail.id ? { ...c, name: data.customer.name, email: data.customer.email, phone: data.customer.phone } : c))
                        setCustEditMode(false)
                      }
                      setCustEditSaving(false)
                    }} style={{ background: '#fff', border: 'none', padding: '8px 16px', cursor: 'pointer', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: '#000' }}>
                      {custEditSaving ? 'SAVING…' : 'SAVE'}
                    </button>
                    <button onClick={() => setCustEditMode(false)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', padding: '8px 16px', cursor: 'pointer', fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>CANCEL</button>
                  </div>
                </div>
              ) : (
                <div style={{ background: 'rgba(255,255,255,0.04)', padding: '14px 16px', marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <Detail label="EMAIL" value={custDetail.email} />
                  <Detail label="PHONE" value={custDetail.phone || '—'} />
                  <Detail label="MEMBER SINCE" value={new Date(custDetail.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} />
                  <button onClick={() => { setCustEditDraft({ name: custDetail.name, email: custDetail.email, phone: custDetail.phone }); setCustEditMode(true) }}
                    style={{ marginTop: 4, background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', padding: '7px 14px', cursor: 'pointer', fontSize: 11, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.45)', alignSelf: 'flex-start' }}>
                    EDIT INFO
                  </button>
                </div>
              )}

              {/* Status + Ban */}
              <div style={{ background: 'rgba(255,255,255,0.04)', padding: '14px 16px', marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', marginBottom: 12 }}>STATUS</div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
                  {(['regular', 'vip', 'warning'] as const).map(s => (
                    <button key={s} onClick={async () => {
                      const res = await fetch(`/api/admin/customers/${custDetail.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: s }) })
                      if (res.ok) {
                        setCustDetail(d => d ? { ...d, status: s } : d)
                        setCustList(list => list.map(c => c.id === custDetail.id ? { ...c, status: s } : c))
                      }
                    }} style={{
                      padding: '5px 12px', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
                      background: custDetail.status === s && !custDetail.banned ? '#fff' : 'rgba(255,255,255,0.06)',
                      color: custDetail.status === s && !custDetail.banned ? '#000' : 'rgba(255,255,255,0.5)',
                    }}>{s.toUpperCase()}</button>
                  ))}
                </div>
                <button onClick={async () => {
                  const newBanned = !custDetail.banned
                  const res = await fetch(`/api/admin/customers/${custDetail.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ banned: newBanned }) })
                  if (res.ok) {
                    setCustDetail(d => d ? { ...d, banned: newBanned } : d)
                    setCustList(list => list.map(c => c.id === custDetail.id ? { ...c, banned: newBanned } : c))
                  }
                }} style={{
                  width: '100%', padding: '9px', border: custDetail.banned ? 'none' : '1px solid rgba(239,68,68,0.4)', cursor: 'pointer',
                  fontFamily: 'Inter, sans-serif', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em',
                  background: custDetail.banned ? '#ef4444' : 'transparent',
                  color: custDetail.banned ? '#fff' : '#ef4444',
                }}>
                  {custDetail.banned ? '⊘ UNBAN CUSTOMER' : '⊘ BAN CUSTOMER'}
                </button>
              </div>

              {/* Custom Pricing */}
              {(() => {
                const ALL_SETS: { slug: string; label: string; standard: number }[] = [
                  { slug: 'set-a',         label: 'Set A',            standard: 40 },
                  { slug: 'set-b',         label: 'Set B',            standard: 40 },
                  { slug: 'set-c',         label: 'Set C',            standard: 40 },
                  { slug: 'set-d',         label: 'Set D',            standard: 40 },
                  { slug: 'concrete',      label: 'Concrete',         standard: 40 },
                  { slug: 'vintage',       label: 'Vintage',          standard: 40 },
                  { slug: 'cottage',       label: 'Cottage',          standard: 40 },
                  { slug: 'watering-hole', label: 'Watering Hole',    standard: 75 },
                  { slug: 'studio-one',    label: 'Studio One',       standard: 65 },
                ]
                const hasPricing = custDetail!.pricingOverrides != null
                const smallInput = { background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 13, padding: '6px 8px', width: '70px', outline: 'none' } as const
                return (
                  <div style={{ background: 'rgba(255,255,255,0.04)', padding: '14px 16px', marginBottom: 16 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)' }}>CUSTOM PRICING</div>
                      {hasPricing && (
                        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.1em', color: '#d4a843', background: 'rgba(212,168,67,0.12)', border: '1px solid rgba(212,168,67,0.3)', padding: '2px 8px' }}>ACTIVE</span>
                      )}
                    </div>

                    {/* Global rate */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', width: 130, flexShrink: 0 }}>Global rate (all sets)</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)' }}>$</span>
                        <input type="number" min="0" placeholder="—" value={custPricingDraft.hourly_rate}
                          onChange={e => setCustPricingDraft(d => ({ ...d, hourly_rate: e.target.value }))}
                          style={smallInput} />
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>/hr</span>
                      </div>
                    </div>

                    {/* Equipment discount */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', width: 130, flexShrink: 0 }}>Equipment discount</div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                        <input type="number" min="0" max="100" placeholder="0" value={custPricingDraft.equipment_discount_percent}
                          onChange={e => setCustPricingDraft(d => ({ ...d, equipment_discount_percent: e.target.value }))}
                          style={smallInput} />
                        <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>% off</span>
                      </div>
                    </div>

                    {/* Per-set overrides */}
                    <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.2)', marginBottom: 8 }}>PER-SET OVERRIDE (overrides global)</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', marginBottom: 14 }}>
                      {ALL_SETS.map(s => (
                        <div key={s.slug} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', width: 80, flexShrink: 0 }}>{s.label}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>$</span>
                            <input type="number" min="0"
                              placeholder={String(s.standard)}
                              value={custPricingDraft.sets[s.slug] ?? ''}
                              onChange={e => setCustPricingDraft(d => ({ ...d, sets: { ...d.sets, [s.slug]: e.target.value } }))}
                              style={{ ...smallInput, width: '54px' }} />
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ display: 'flex', gap: 8 }}>
                      <button disabled={custPricingSaving} onClick={async () => {
                        setCustPricingSaving(true)
                        const overrides: PricingOverrides = {}
                        if (custPricingDraft.hourly_rate !== '') overrides.hourly_rate = Number(custPricingDraft.hourly_rate)
                        if (custPricingDraft.equipment_discount_percent !== '') overrides.equipment_discount_percent = Number(custPricingDraft.equipment_discount_percent)
                        const sets: Record<string, number> = {}
                        Object.entries(custPricingDraft.sets).forEach(([k, v]) => { if (v !== '') sets[k] = Number(v) })
                        if (Object.keys(sets).length > 0) overrides.sets = sets
                        const payload = Object.keys(overrides).length > 0 ? overrides : null
                        const res = await fetch(`/api/admin/customers/${custDetail!.id}`, {
                          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ pricingOverrides: payload }),
                        })
                        if (res.ok) setCustDetail(d => d ? { ...d, pricingOverrides: payload } : d)
                        setCustPricingSaving(false)
                      }} style={{ background: '#d4a843', border: 'none', padding: '7px 16px', cursor: 'pointer', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: '#000', opacity: custPricingSaving ? 0.6 : 1 }}>
                        {custPricingSaving ? 'SAVING…' : 'SAVE PRICING'}
                      </button>
                      {hasPricing && (
                        <button disabled={custPricingSaving} onClick={async () => {
                          setCustPricingSaving(true)
                          const res = await fetch(`/api/admin/customers/${custDetail!.id}`, {
                            method: 'PATCH', headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ pricingOverrides: null }),
                          })
                          if (res.ok) {
                            setCustDetail(d => d ? { ...d, pricingOverrides: null } : d)
                            setCustPricingDraft({ hourly_rate: '', equipment_discount_percent: '', sets: {} })
                          }
                          setCustPricingSaving(false)
                        }} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.12)', padding: '7px 14px', cursor: 'pointer', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.4)' }}>
                          CLEAR
                        </button>
                      )}
                    </div>
                  </div>
                )
              })()}

              {/* Notes */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', marginBottom: 12 }}>NOTES</div>

                {/* Add note */}
                <div style={{ background: 'rgba(255,255,255,0.04)', padding: '12px 14px', marginBottom: 10 }}>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
                    {(['general', 'vip', 'warning', 'ban'] as const).map(t => (
                      <button key={t} onClick={() => setCustNoteTag(t)} style={{
                        padding: '4px 10px', border: 'none', cursor: 'pointer', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
                        background: custNoteTag === t ? '#fff' : 'rgba(255,255,255,0.06)',
                        color: custNoteTag === t ? '#000' : 'rgba(255,255,255,0.4)',
                      }}>{t.toUpperCase()}</button>
                    ))}
                  </div>
                  <textarea
                    placeholder="Add a note…"
                    value={custNoteText}
                    onChange={e => setCustNoteText(e.target.value)}
                    rows={2}
                    style={{ ...inputStyle, fontSize: 13, resize: 'none', marginBottom: 8 }}
                  />
                  <button onClick={async () => {
                    if (!custNoteText.trim()) return
                    setCustNoteAdding(true)
                    const res = await fetch(`/api/admin/customers/${custDetail.id}/notes`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ note: custNoteText, tag: custNoteTag }),
                    })
                    if (res.ok) {
                      const data = await res.json()
                      setCustDetail(d => d ? { ...d, notes: [data.note, ...d.notes] } : d)
                      setCustNoteText('')
                    }
                    setCustNoteAdding(false)
                  }} style={{ background: '#fff', border: 'none', padding: '7px 16px', cursor: 'pointer', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em', color: '#000' }}>
                    {custNoteAdding ? 'ADDING…' : 'ADD NOTE'}
                  </button>
                </div>

                {/* Note list */}
                {custDetail.notes.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)', padding: '8px 0' }}>No notes yet</div>
                ) : custDetail.notes.map(n => {
                  const tagColor: Record<string, string> = { vip: '#d4a843', warning: '#f97316', ban: '#ef4444', general: 'rgba(255,255,255,0.3)' }
                  return (
                    <div key={n.id} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', padding: '10px 12px', marginBottom: 6 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <span style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.1em', color: tagColor[n.tag] ?? tagColor.general }}>{n.tag.toUpperCase()}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.25)' }}>
                            {new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                          </span>
                          <button onClick={async () => {
                            const res = await fetch(`/api/admin/customers/${custDetail.id}/notes/${n.id}`, { method: 'DELETE' })
                            if (res.ok) setCustDetail(d => d ? { ...d, notes: d.notes.filter(x => x.id !== n.id) } : d)
                          }} style={{ background: 'transparent', border: 'none', color: 'rgba(255,255,255,0.25)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>&#x2715;</button>
                        </div>
                      </div>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.75)', lineHeight: 1.5 }}>{n.note}</div>
                    </div>
                  )
                })}
              </div>

              {/* Booking history */}
              <div>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', marginBottom: 12 }}>
                  BOOKING HISTORY ({custDetail.bookings.length})
                </div>
                {custDetail.bookings.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.25)' }}>No bookings</div>
                ) : custDetail.bookings.slice(0, 10).map((b: any) => (
                  <div key={b.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 13, color: '#fff', marginBottom: 2 }}>{b.sets?.name || 'Full Studio'}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>{fmtDate(b.start_time)}</div>
                    </div>
                    <div style={{ textAlign: 'right' as const }}>
                      <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)', marginBottom: 2 }}>${(b.total_amount ?? 0).toLocaleString()}</div>
                      <span style={{ fontSize: 10, color: b.status === 'confirmed' ? '#4ade80' : b.status === 'cancelled' ? '#ef4444' : 'rgba(255,255,255,0.35)', letterSpacing: '0.08em' }}>
                        {b.status.toUpperCase()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

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
