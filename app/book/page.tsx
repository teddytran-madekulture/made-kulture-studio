'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import NavAuthLink from '@/components/NavAuthLink'
import { useIsMobile } from '@/lib/use-is-mobile'
import DatePicker from '@/components/DatePicker'

// ─── Square SDK loader ────────────────────────────────────────────────────────

declare global {
  interface Window { Square?: any }
}

function loadSquareScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Square) { resolve(); return }
    // Auto-detect environment from the app ID (sandbox IDs start with "sandbox-")
    const appId = process.env.NEXT_PUBLIC_SQUARE_APP_ID ?? ''
    const src = appId.startsWith('sandbox-')
      ? 'https://sandbox.web.squarecdn.com/v1/square.js'
      : 'https://web.squarecdn.com/v1/square.js'
    const script = document.createElement('script')
    script.src = src
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Square.js'))
    document.head.appendChild(script)
  })
}

// ─── Data ────────────────────────────────────────────────────────────────────

// Sets are loaded from /api/sets at runtime (admin Sets Manager is the source
// of truth). Shape used by this page:
interface BookSet { id: string; name: string; price: number; desc: string; minHours: number }

// One set added to a multi-set order (per-set scheduling). price = effective
// hourly rate (with any customer overrides) captured when it was added.
interface SetCartItem {
  setId: string; setName: string; price: number; minHours: number
  date: string; startHour: number; endHour: number
}

const EQUIPMENT = [
  { id: 'eq-1',  name: 'Aputure LS 600d Daylight',        price: 70 },
  { id: 'eq-2',  name: 'Aputure LS C300d II Daylight',     price: 50 },
  { id: 'eq-3',  name: 'Aputure LS 300x Bi-Color',         price: 50 },
  { id: 'eq-4',  name: 'Aputure Amaran F22C',              price: 50 },
  { id: 'eq-5',  name: 'Amaran 300c RGBWW LED',            price: 35 },
  { id: 'eq-6',  name: 'Amaran 200x Bi-Color (extra)',     price: 25 },
  { id: 'eq-7',  name: 'Profoto 2x D1 Air 500w Kit',       price: 150 },
  { id: 'eq-8',  name: 'Flashpoint XPLOR 400 Pro',         price: 30 },
  { id: 'eq-9',  name: 'Flashpoint XPLOR 100 Pro',         price: 20 },
  { id: 'eq-10', name: 'Aputure Spotlight Mount 36°',      price: 25 },
  { id: 'eq-11', name: 'Haze Machine (fluid incl.)',       price: 60 },
  { id: 'eq-12', name: 'Ice Fog Machine + 2.5L fluid',     price: 65 },
  { id: 'eq-13', name: 'Christie HD6K-M Projector',        price: 150 },
  { id: 'eq-14', name: 'Canon EOS R5',                     price: 65 },
]

const SLOTS = Array.from({ length: 26 }, (_, i) => 9 + i * 0.5) // 9:00–21:30 in 30-min steps
const STUDIO_PRICE = 400 // default buyout rate; overridden by DB (studio_settings.buyout_rate)
const CLOSE_HOUR = 22 // 10pm

function fmt12(h: number) {
  const hour = Math.floor(h)
  const half = h % 1 !== 0
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12  = hour % 12 === 0 ? 12 : hour % 12
  return half ? `${h12}:30${ampm}` : `${h12}${ampm}`
}

function today() {
  const d = new Date()
  // Require 48hr advance booking
  d.setDate(d.getDate() + 2)
  return d.toISOString().split('T')[0]
}

// ─── Types ───────────────────────────────────────────────────────────────────

type BookingType = 'set' | 'studio'

interface GearLine { id: string; name: string; rate: number; quantity: number }

interface BookingState {
  type:        BookingType | null
  guests:      number | null   // declared party size — drives the set ladder
  setId:       string | null
  date:        string
  startHour:   number | null
  endHour:     number | null   // exclusive — endHour=14 means session ends at 2pm
  equipment:   GearLine[]      // gear cart: DB equipment id + quantity
  name:        string
  email:       string
  phone:       string
  notes:       string
  smsConsent:  boolean
  guestAck:    boolean         // confirmed the party-size limit at checkout
}

// Default guest pricing knobs (overridden by /api/sets → studio_settings).
interface GuestPricing {
  capacityPerSet: number; perPersonFee: number
  maxGuestsPerSet: number; maxSetsBeforeBuyout: number; penaltyPerHead: number
}
const DEFAULT_GUEST_PRICING: GuestPricing = {
  capacityPerSet: 5, perPersonFee: 10, maxGuestsPerSet: 7, maxSetsBeforeBuyout: 3, penaltyPerHead: 50,
}

// Map a declared party size to the recommended product tier.
function recommendForGuests(n: number, k: GuestPricing) {
  if (n <= k.capacityPerSet)
    return { label: '1 set', setsNeeded: 1, buffer: 0, buyout: false }
  if (n <= k.maxGuestsPerSet)
    return { label: '1 set + guest fee', setsNeeded: 1, buffer: n - k.capacityPerSet, buyout: false }
  const setsNeeded = Math.ceil(n / k.capacityPerSet)
  if (setsNeeded <= k.maxSetsBeforeBuyout)
    return { label: `${setsNeeded} sets`, setsNeeded, buffer: 0, buyout: false }
  return { label: 'Full buyout', setsNeeded: 0, buffer: 0, buyout: true }
}

const GEAR_CART_KEY = 'mk_gear_cart'
function loadGearCart(): GearLine[] {
  if (typeof window === 'undefined') return []
  try { return JSON.parse(localStorage.getItem(GEAR_CART_KEY) || '[]') } catch { return [] }
}

// ─── Main Component ──────────────────────────────────────────────────────────

function BookingWizard() {
  const isMobile = useIsMobile()
  const searchParams = useSearchParams()
  const typeParam  = searchParams.get('type') as BookingType | null
  const setParam   = searchParams.get('set')   // e.g. "set-a" (from availability chart)
  const dateParam  = searchParams.get('date')  // e.g. "2026-06-28"
  const startParam = searchParams.get('start') // e.g. "10"

  // If coming from availability chart with set+date+start, jump to time step
  const hasPreFill = typeParam === 'set' && !!setParam && !!dateParam
  const initialStep = hasPreFill ? 4 : (typeParam ? 2 : 1)

  const [step, setStep] = useState(initialStep)
  const [booking, setBooking] = useState<BookingState>({
    type:      typeParam || null,
    guests:    null,
    setId:     setParam || null,
    date:      dateParam || today(),
    startHour: startParam ? parseFloat(startParam) : null,
    endHour:   null,
    equipment: [],
    name: '', email: '', phone: '', notes: '', smsConsent: false, guestAck: false,
  })
  // Pull any gear the customer added on the /gear page into this booking,
  // and re-sync whenever they return to this tab (e.g. after adding on /gear).
  useEffect(() => {
    const sync = () => {
      const cart = loadGearCart()
      setBooking(b => ({ ...b, equipment: cart }))
    }
    sync()
    window.addEventListener('focus', sync)
    return () => window.removeEventListener('focus', sync)
  }, [])

  // Keep edits made here in step 5 mirrored to the shared gear cart.
  const updateGear = (lines: GearLine[]) => {
    setBooking(b => ({ ...b, equipment: lines }))
    try { localStorage.setItem(GEAR_CART_KEY, JSON.stringify(lines)) } catch {}
  }

  // ── Inline gear catalog (added right in the booking flow) ───────────────────
  const [gearCatalog, setGearCatalog] = useState<{ id: string; name: string; rate: number; category: string; description: string | null; quantity: number }[]>([])
  const [gearSearch,  setGearSearch]  = useState('')
  const [openCats,    setOpenCats]    = useState<Record<string, boolean>>({})
  const [hoverGear,   setHoverGear]   = useState<string | null>(null)
  useEffect(() => {
    fetch('/api/equipment').then(r => r.json()).then(d => setGearCatalog(d.equipment ?? [])).catch(() => {})
  }, [])

  // Multi-set order: committed set line items (each with its own date/time).
  const [setCart, setSetCart] = useState<SetCartItem[]>([])

  // Sets catalog + buyout rate (DB-driven) for the picker, pricing, and minimums.
  const [sets, setSets] = useState<BookSet[]>([])
  const [buyoutRate, setBuyoutRate] = useState(STUDIO_PRICE)
  const [guestPricing, setGuestPricing] = useState<GuestPricing>(DEFAULT_GUEST_PRICING)
  useEffect(() => {
    fetch('/api/sets').then(r => r.json()).then(d => {
      setSets(
        (d.sets ?? []).map((s: any) => ({
          id: s.slug,
          name: s.name,
          price: Number(s.rate_per_hour),
          desc: s.description ?? '',
          minHours: s.min_hours ?? 1,
        }))
      )
      if (d.buyoutRate) setBuyoutRate(Number(d.buyoutRate))
      if (d.guestPricing) setGuestPricing({ ...DEFAULT_GUEST_PRICING, ...d.guestPricing })
    }).catch(() => {})
  }, [])

  const gearQty = (id: string) => booking.equipment.find(l => l.id === id)?.quantity ?? 0
  const addGearItem = (item: { id: string; name: string; rate: number; quantity: number }) => {
    const existing = booking.equipment.find(l => l.id === item.id)
    if (existing) {
      updateGear(booking.equipment.map(l => l.id === item.id ? { ...l, quantity: Math.min(item.quantity || 99, l.quantity + 1) } : l))
    } else {
      updateGear([...booking.equipment, { id: item.id, name: item.name, rate: item.rate, quantity: 1 }])
    }
  }
  const decGearItem = (id: string) =>
    updateGear(booking.equipment.flatMap(l => l.id === id ? (l.quantity > 1 ? [{ ...l, quantity: l.quantity - 1 }] : []) : [l]))

  const renderGearRow = (g: { id: string; name: string; rate: number; description: string | null; quantity: number }) => {
    const qty = gearQty(g.id)
    const hovered = hoverGear === g.id
    return (
      <div key={g.id}
        onMouseEnter={() => setHoverGear(g.id)} onMouseLeave={() => setHoverGear(null)}
        style={{ background: hovered ? '#161616' : '#0d0d0d', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, borderTop: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.12s' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontFamily: 'Inter', fontSize: 13, color: '#fff' }}>{g.name}</span>
            <a href={`/gear#${g.id}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'Inter', fontSize: 10, letterSpacing: '0.06em', color: 'rgba(255,255,255,0.35)', textDecoration: 'none', flexShrink: 0 }}>
              details
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
            </a>
          </div>
          <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>${g.rate}</div>
          {hovered && g.description && (
            <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 6, lineHeight: 1.45, maxWidth: 520 }}>{g.description}</div>
          )}
        </div>
        {qty > 0 ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button onClick={() => decGearItem(g.id)} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', width: 26, height: 26, cursor: 'pointer', fontSize: 15 }}>−</button>
            <span style={{ fontSize: 13, minWidth: 16, textAlign: 'center' }}>{qty}</span>
            <button onClick={() => addGearItem(g)} disabled={qty >= g.quantity} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', width: 26, height: 26, cursor: qty >= g.quantity ? 'default' : 'pointer', fontSize: 15, opacity: qty >= g.quantity ? 0.3 : 1 }}>+</button>
          </div>
        ) : (
          <button onClick={() => addGearItem(g)} style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', padding: '7px 16px', cursor: 'pointer', fontFamily: 'Inter, sans-serif', fontSize: 10, fontWeight: 600, letterSpacing: '0.1em' }}>ADD</button>
        )}
      </div>
    )
  }

  const [bookedSlots,      setBookedSlots]      = useState<{ start: number; end: number }[]>([])
  const [loadingSlots,     setLoadingSlots]     = useState(false)
  const [submitted,        setSubmitted]        = useState(false)
  const [pricingOverrides, setPricingOverrides] = useState<any>(null)

  // Pre-fill contact info + fetch custom pricing from logged-in profile
  useEffect(() => {
    fetch('/api/account/profile')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d?.profile) {
          setBooking(b => ({
            ...b,
            name:  d.profile.full_name  || b.name,
            email: d.profile.email      || b.email,
            phone: d.profile.phone      || b.phone,
          }))
        }
        if (d?.pricingOverrides) setPricingOverrides(d.pricingOverrides)
      })
      .catch(() => {})
  }, [])

  // Fetch availability when set + date change
  useEffect(() => {
    if (booking.type === 'studio' || !booking.setId || !booking.date) return
    setLoadingSlots(true)
    fetch(`/api/availability?set_id=${booking.setId}&date=${booking.date}`)
      .then(r => r.json())
      .then(d => { setBookedSlots(d.booked || []); setLoadingSlots(false) })
      .catch(() => setLoadingSlots(false))
  }, [booking.setId, booking.date, booking.type])

  // ── Derived ────────────────────────────────────────────────────────────────

  const selectedSet  = sets.find(s => s.id === booking.setId)
  const hourCount    = booking.startHour !== null && booking.endHour !== null
                       ? booking.endHour - booking.startHour : 0

  // Minimum booking length: full warehouse buyout = 4hr, otherwise the set's own min
  const STUDIO_MIN_HOURS = 4
  const minHours     = booking.type === 'studio' ? STUDIO_MIN_HOURS : (selectedSet?.minHours ?? 1)
  const minLabel     = booking.type === 'studio' ? 'Full Studio Takeover' : selectedSet?.name

  // Apply custom pricing overrides if present
  const standardSetRate = selectedSet?.price ?? 65
  const perSetOverride  = booking.setId ? pricingOverrides?.sets?.[booking.setId] : undefined
  const globalOverride  = pricingOverrides?.hourly_rate
  const setRate         = perSetOverride != null ? Number(perSetOverride)
                        : globalOverride != null ? Number(globalOverride)
                        : standardSetRate

  const equipDiscount   = pricingOverrides?.equipment_discount_percent
  const equipTotal      = booking.equipment.reduce((sum, l) => sum + l.rate * l.quantity, 0)
  const discountedEquipTotal = equipDiscount
    ? Math.round(equipTotal * (1 - Number(equipDiscount) / 100))
    : equipTotal

  // Multi-set: space total is the sum of every set in the cart.
  const cartSpaceTotal = setCart.reduce((s, it) => s + it.price * (it.endHour - it.startHour), 0)
  const spaceTotal   = booking.type === 'studio'
                       ? (buyoutRate * hourCount)
                       : cartSpaceTotal

  // Per-person buffer fee — only on a single set carrying 6-7 guests.
  const guestRec = booking.guests ? recommendForGuests(booking.guests, guestPricing) : null
  const guestFee = (booking.type === 'set' && setCart.length === 1 && guestRec && guestRec.buffer > 0)
    ? guestRec.buffer * guestPricing.perPersonFee * (setCart[0].endHour - setCart[0].startHour)
    : 0

  const grandTotal   = spaceTotal + discountedEquipTotal + guestFee

  // Comp customers flagged "no card required" skip the card form when total is $0.
  const compNoCard   = !!pricingOverrides?.comp_no_card

  // Is the in-progress set selection complete and valid?
  const currentComplete =
    booking.type === 'set' &&
    !!booking.setId && booking.date !== '' &&
    booking.startHour !== null && booking.endHour !== null &&
    (booking.endHour - booking.startHour) >= minHours

  // Commit the in-progress selection into the cart, then clear it for the next.
  const commitCurrent = () => {
    if (!currentComplete || !booking.setId) return
    const set = sets.find(s => s.id === booking.setId)
    setSetCart(c => [...c, {
      setId: booking.setId!, setName: set?.name ?? booking.setId!,
      price: setRate, minHours: set?.minHours ?? 1,
      date: booking.date, startHour: booking.startHour!, endHour: booking.endHour!,
    }])
    setBooking(b => ({ ...b, setId: null, startHour: null, endHour: null }))
    setBookedSlots([])
  }
  const removeCartItem = (i: number) => setSetCart(c => c.filter((_, idx) => idx !== i))

  const isHourBooked = (h: number) =>
    bookedSlots.some(b => h >= b.start && h < b.end)

  // For time grid: clicking selects start, second click selects end
  // If a start hour was pre-filled from the availability chart, begin in 'end' mode
  const [selecting, setSelecting] = useState<'start' | 'end'>(startParam ? 'end' : 'start')

  const handleHourClick = (h: number) => {
    if (isHourBooked(h)) return
    if (selecting === 'start') {
      setBooking(b => ({ ...b, startHour: h, endHour: null }))
      setSelecting('end')
    } else {
      if (h <= (booking.startHour ?? 0)) {
        setBooking(b => ({ ...b, startHour: h, endHour: null }))
        return
      }
      // End time must be a whole number of hours after start (no 30-min durations)
      if ((h - (booking.startHour ?? 0)) % 1 !== 0) return
      // Enforce minimum booking length (Watering Hole/Tank = 2hr, full warehouse = 4hr)
      if ((h - (booking.startHour ?? 0)) < minHours) return
      // Check no booked slot in range
      const start = booking.startHour!
      const hasConflict = bookedSlots.some(b => b.start < h && b.end > start)
      if (hasConflict) return
      setBooking(b => ({ ...b, endHour: h }))
      setSelecting('start')
    }
  }

  const isInRange = (h: number) =>
    booking.startHour !== null &&
    booking.endHour !== null &&
    h > booking.startHour && h < booking.endHour

  const isStart = (h: number) => h === booking.startHour
  const isEnd   = (h: number) => booking.endHour !== null && h === booking.endHour

  // ── Steps ──────────────────────────────────────────────────────────────────

  const totalSteps = booking.type === 'studio' ? 6 : 7

  const canNext: Record<number, boolean> = {
    1: booking.type !== null,
    2: booking.type === 'studio' ? true : booking.setId !== null,
    3: booking.date !== '',
    4: booking.type === 'studio'
       ? (booking.startHour !== null && booking.endHour !== null && (booking.endHour - booking.startHour) >= minHours)
       : (currentComplete || setCart.length > 0),
    5: true, // equipment optional
    6: booking.name !== '' && booking.email !== '' && booking.phone !== '' && booking.smsConsent
       && booking.guests != null && booking.guestAck,
  }

  const next = () => setStep(s => s + 1)
  const back = () => setStep(s => s - 1)

  // Adjust step labels for studio (no set selection step)
  const effectiveStep = booking.type === 'studio' && step >= 2 ? step - 1 : step

  // ── Render ─────────────────────────────────────────────────────────────────

  if (submitted) return <SuccessScreen booking={booking} setCart={setCart} />

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#fff' }}>

      {/* NAV */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '24px 40px',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
        background: 'rgba(8,8,8,0.97)',
        backdropFilter: 'blur(12px)',
      }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 20, letterSpacing: '0.05em', color: '#fff', lineHeight: 1 }}>
            MADE<br />KULTURE
          </div>
        </Link>
        <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.4)' }}>
          BOOK A SESSION
        </div>
      </nav>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: isMobile ? '92px 16px 56px' : '120px 40px 80px' }}>

        {/* Progress bar */}
        <div style={{ marginBottom: 60 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)' }}>
              STEP {step} OF {totalSteps}
            </span>
            <span style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)' }}>
              {STEP_LABELS[step] || ''}
            </span>
          </div>
          <div style={{ height: 1, background: 'rgba(255,255,255,0.08)' }}>
            <div style={{ height: '100%', background: '#fff', width: `${(step / totalSteps) * 100}%`, transition: 'width 0.4s ease' }} />
          </div>
        </div>

        {/* ── STEP 1: Type ── */}
        {step === 1 && booking.type === null && (
          <StepWrapper title="HOW WOULD YOU LIKE TO BOOK?">
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 1, background: 'rgba(255,255,255,0.06)' }}>
              {[
                { type: 'set' as BookingType,    label: 'INDIVIDUAL SET',        sub: 'Reserve one set by the hour. $40–$75/hr.',  limit: 'Up to 5 people per set', price: 'FROM $40/HR' },
                { type: 'studio' as BookingType, label: 'FULL STUDIO TAKEOVER',  sub: 'Entire warehouse — all sets, private.',       limit: 'Up to 30 people',       price: 'CONTACT FOR RATE' },
              ].map(opt => (
                <button key={opt.type} onClick={() => { setBooking(b => ({ ...b, type: opt.type })) }}
                  style={{
                    background: '#0d0d0d',
                    border: 'none', padding: '60px 48px', cursor: 'pointer', textAlign: 'left',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#111' }}
                  onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#0d0d0d' }}
                >
                  <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 36, color: '#fff', letterSpacing: '0.02em', marginBottom: 12 }}>
                    {opt.label}
                  </div>
                  <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 10 }}>
                    {opt.sub}
                  </p>
                  <p style={{ fontFamily: 'Inter', fontSize: 13, fontWeight: 700, color: '#fff', lineHeight: 1.6, marginBottom: 24 }}>
                    {opt.limit}
                  </p>
                  <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)' }}>
                    {opt.price}
                  </div>
                </button>
              ))}
            </div>
          </StepWrapper>
        )}

        {/* ── STEP 1b: Guest count (own screen, after type is chosen) ── */}
        {step === 1 && booking.type !== null && (
          <GuestStep
            type={booking.type}
            guests={booking.guests}
            pricing={guestPricing}
            buyoutRate={buyoutRate}
            onChange={(n) => setBooking(b => ({ ...b, guests: n }))}
            onBack={() => setBooking(b => ({ ...b, type: null, guests: null }))}
            onContinue={() => setStep(2)}
            onSwitchToBuyout={() => setBooking(b => ({ ...b, type: 'studio' }))}
          />
        )}

        {/* ── STEP 2: Set selection (individual only) ── */}
        {step === 2 && booking.type === 'set' && (
          <StepWrapper title="CHOOSE YOUR SET">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 1, background: 'rgba(255,255,255,0.06)' }}>
              {sets.length === 0 && (
                <div style={{ gridColumn: '1 / -1', padding: '28px 24px', background: '#0d0d0d', fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>
                  Loading sets…
                </div>
              )}
              {sets.map(s => (
                <button key={s.id} onClick={() => setBooking(b => ({ ...b, setId: s.id }))}
                  style={{
                    background: booking.setId === s.id ? '#fff' : '#0d0d0d',
                    border: 'none', padding: '28px 24px', cursor: 'pointer', textAlign: 'left',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={e => { if (booking.setId !== s.id) (e.currentTarget as HTMLButtonElement).style.background = '#111' }}
                  onMouseLeave={e => { if (booking.setId !== s.id) (e.currentTarget as HTMLButtonElement).style.background = '#0d0d0d' }}
                >
                  <div style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.15em', color: booking.setId === s.id ? 'rgba(0,0,0,0.4)' : 'rgba(255,255,255,0.3)', marginBottom: 10 }}>
                    ${s.price}/HR {s.minHours > 1 ? `· ${s.minHours}HR MIN` : ''}
                  </div>
                  <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 26, color: booking.setId === s.id ? '#080808' : '#fff', letterSpacing: '0.02em', marginBottom: 6 }}>
                    {s.name.toUpperCase()}
                  </div>
                  <p style={{ fontFamily: 'Inter', fontSize: 12, color: booking.setId === s.id ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.35)', lineHeight: 1.5 }}>
                    {s.desc}
                  </p>
                </button>
              ))}
            </div>
            <NavRow onBack={back} onNext={next} canNext={canNext[2]} />
          </StepWrapper>
        )}

        {/* ── STEP 2 (studio) or STEP 3: Date ── */}
        {((step === 3 && booking.type === 'set') || (step === 2 && booking.type === 'studio')) && (
          <StepWrapper title="PICK A DATE">
            <div style={{ maxWidth: 400 }}>
              <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 32 }}>
                Bookings require at least 48 hours advance notice. Studio hours are Monday–Sunday, 9am–10pm.
              </p>
              <DatePicker
                value={booking.date}
                min={today()}
                onChange={d => {
                  setBooking(b => ({ ...b, date: d, startHour: null, endHour: null }))
                  setBookedSlots([])
                }}
              />
            </div>
            <NavRow onBack={back} onNext={next} canNext={canNext[3]} />
          </StepWrapper>
        )}

        {/* ── STEP 4: Time ── */}
        {((step === 4 && booking.type === 'set') || (step === 3 && booking.type === 'studio')) && (
          <StepWrapper title={booking.type === 'set' && !booking.setId ? 'ADD ANOTHER SET' : 'SELECT YOUR TIME'}>
            {booking.type === 'set' && !booking.setId ? (
              <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, marginBottom: 24 }}>
                Your sets so far are below. Tap “+ Add another set” to choose another, or Continue to checkout.
              </p>
            ) : (
              <>
            <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 8 }}>
              {booking.startHour === null
                ? `Click your start time, then click your end time.${minHours > 1 ? ` ${minLabel} has a ${minHours}-hour minimum.` : ''}`
                : booking.endHour === null
                  ? `Start: ${fmt12(booking.startHour)} — now click your end time.${minHours > 1 ? ` (${minHours}-hour minimum)` : ''}`
                  : `${fmt12(booking.startHour)} – ${fmt12(booking.endHour)} · ${hourCount} hour${hourCount !== 1 ? 's' : ''}`
              }
            </p>
            {loadingSlots && (
              <p style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', marginBottom: 16 }}>
                CHECKING AVAILABILITY...
              </p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(72px, 1fr))', gap: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 32 }}>
              {SLOTS.map(h => {
                const booked    = isHourBooked(h)
                // When picking end time, only allow whole-hour slots that meet the
                // set's minimum length (e.g. The Watering Hole / The Tank = 2hr min)
                const isInvalidEnd = selecting === 'end' && booking.startHour !== null
                                     && ((h - booking.startHour) % 1 !== 0
                                         || (h > booking.startHour && (h - booking.startHour) < minHours))
                const inRange   = isInRange(h)
                const start     = isStart(h)
                const end       = isEnd(h)
                const isPending = booking.startHour === h && booking.endHour === null

                let bg = '#0d0d0d'
                let color = isInvalidEnd ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.6)'
                if (booked)       { bg = '#0d0d0d'; color = 'rgba(255,255,255,0.12)' }
                if (inRange)      { bg = '#fff'; color = '#080808' }
                if (start || end) { bg = '#fff'; color = '#080808' }
                if (isPending)    { bg = 'rgba(255,255,255,0.2)'; color = '#fff' }

                return (
                  <button key={h} onClick={() => handleHourClick(h)} disabled={booked || isInvalidEnd}
                    style={{
                      background: bg, border: 'none', padding: '16px 8px',
                      cursor: booked ? 'not-allowed' : isInvalidEnd ? 'default' : 'pointer',
                      textAlign: 'center', transition: 'background 0.1s',
                    }}
                  >
                    <div style={{ fontFamily: 'Inter', fontSize: 12, fontWeight: 500, color, letterSpacing: '0.05em' }}>
                      {fmt12(h)}
                    </div>
                    {booked && (
                      <div style={{ fontFamily: 'Inter', fontSize: 9, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.08em', marginTop: 4 }}>
                        BOOKED
                      </div>
                    )}
                  </button>
                )
              })}
            </div>
            {/* Reset */}
            {(booking.startHour !== null) && (
              <button onClick={() => { setBooking(b => ({ ...b, startHour: null, endHour: null })); setSelecting('start') }}
                style={{ background: 'transparent', border: 'none', cursor: 'pointer', fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.3)', textDecoration: 'underline', marginBottom: 24, display: 'block' }}>
                RESET SELECTION
              </button>
            )}
              </>
            )}

            {/* Multi-set: sets added so far + add another */}
            {booking.type === 'set' && (
              <div style={{ marginBottom: 24 }}>
                {setCart.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', color: '#d4a843', marginBottom: 10 }}>SETS IN THIS BOOKING</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                      {setCart.map((it, i) => (
                        <div key={i} style={{ background: 'rgba(255,255,255,0.03)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                          <div style={{ flex: 1, minWidth: 0, fontFamily: 'Inter', fontSize: 13 }}>
                            {it.setName} <span style={{ color: 'rgba(255,255,255,0.4)' }}>· {it.date} · {fmt12(it.startHour)}–{fmt12(it.endHour)} · ${it.price * (it.endHour - it.startHour)}</span>
                          </div>
                          <button onClick={() => removeCartItem(i)} style={{ background: 'transparent', border: 'none', color: 'rgba(220,120,120,0.7)', width: 26, height: 26, cursor: 'pointer', fontSize: 16 }}>×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {(currentComplete || setCart.length > 0) && (
                  <button onClick={() => { commitCurrent(); setStep(2) }}
                    style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.25)', color: '#fff', padding: '12px 20px', cursor: 'pointer', fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, letterSpacing: '0.15em' }}>
                    + ADD ANOTHER SET
                  </button>
                )}
              </div>
            )}

            <NavRow onBack={back} onNext={() => { commitCurrent(); next() }} canNext={canNext[4]} />
          </StepWrapper>
        )}

        {/* ── STEP 5: Add-ons ── */}
        {((step === 5 && booking.type === 'set') || (step === 4 && booking.type === 'studio')) && (
          <StepWrapper title="ADD EQUIPMENT">
            <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 20 }}>
              All equipment is in-studio only. Your set already includes one Amaran 200x light. This step is optional — search or browse by category to add extras.
            </p>

            {/* Search */}
            <input
              value={gearSearch}
              onChange={e => setGearSearch(e.target.value)}
              placeholder="Search equipment…"
              style={{ width: '100%', background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', padding: '12px 14px', fontFamily: 'Inter, sans-serif', fontSize: 14, boxSizing: 'border-box', marginBottom: 16 }}
            />

            {/* Picker */}
            <div style={{ marginBottom: 28 }}>
              {gearCatalog.length === 0 ? (
                <div style={{ background: '#0d0d0d', border: '1px dashed rgba(255,255,255,0.12)', padding: 24, textAlign: 'center', color: 'rgba(255,255,255,0.35)', fontSize: 12, letterSpacing: '0.1em' }}>LOADING GEAR…</div>
              ) : gearSearch.trim() ? (
                (() => {
                  const q = gearSearch.toLowerCase().trim()
                  const matches = gearCatalog.filter(g => g.name.toLowerCase().includes(q))
                  return matches.length
                    ? <div style={{ border: '1px solid rgba(255,255,255,0.06)' }}>{matches.map(renderGearRow)}</div>
                    : <div style={{ padding: 20, color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>No equipment matches “{gearSearch}”.</div>
                })()
              ) : (
                ([['lighting', 'Lighting'], ['modifier', 'Modifiers'], ['special_effects', 'Special Effects'], ['camera', 'Camera']] as const).map(([key, label]) => {
                  const items = gearCatalog.filter(g => g.category === key)
                  if (!items.length) return null
                  const open = !!openCats[key]
                  return (
                    <div key={key} style={{ marginBottom: 8, border: '1px solid rgba(255,255,255,0.08)' }}>
                      <button onClick={() => setOpenCats(c => ({ ...c, [key]: !c[key] }))}
                        style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0d0d0d', border: 'none', padding: '14px 16px', cursor: 'pointer', color: '#fff', fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 600, letterSpacing: '0.12em' }}>
                        <span>{label.toUpperCase()} <span style={{ color: 'rgba(255,255,255,0.35)' }}>({items.length})</span></span>
                        <span style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)' }}>{open ? '−' : '+'}</span>
                      </button>
                      {open && <div>{items.map(renderGearRow)}</div>}
                    </div>
                  )
                })
              )}
            </div>

            {/* Your kit */}
            {booking.equipment.length > 0 && (
              <div style={{ marginBottom: 32 }}>
                <div style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 600, letterSpacing: '0.18em', color: '#d4a843', marginBottom: 10 }}>YOUR KIT</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {booking.equipment.map(l => (
                    <div key={l.id} style={{ background: 'rgba(255,255,255,0.03)', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
                      <div style={{ flex: 1, minWidth: 0, fontFamily: 'Inter', fontSize: 13 }}>
                        {l.name} <span style={{ color: 'rgba(255,255,255,0.35)' }}>· ${l.rate * l.quantity}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button onClick={() => decGearItem(l.id)} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', width: 26, height: 26, cursor: 'pointer', fontSize: 15 }}>−</button>
                        <span style={{ fontSize: 13, minWidth: 16, textAlign: 'center' }}>{l.quantity}</span>
                        <button onClick={() => addGearItem({ id: l.id, name: l.name, rate: l.rate, quantity: gearCatalog.find(g => g.id === l.id)?.quantity ?? 99 })} style={{ background: 'rgba(255,255,255,0.08)', border: 'none', color: '#fff', width: 26, height: 26, cursor: 'pointer', fontSize: 15 }}>+</button>
                        <button onClick={() => updateGear(booking.equipment.filter(x => x.id !== l.id))} style={{ background: 'transparent', border: 'none', color: 'rgba(220,120,120,0.7)', width: 26, height: 26, cursor: 'pointer', fontSize: 16 }}>×</button>
                      </div>
                    </div>
                  ))}
                  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 16px', background: 'rgba(255,255,255,0.05)' }}>
                    <span style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)' }}>GEAR SUBTOTAL</span>
                    <span style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 20 }}>${equipTotal}</span>
                  </div>
                </div>
              </div>
            )}

            <NavRow onBack={back} onNext={next} canNext={true} nextLabel="CONTINUE" />
          </StepWrapper>
        )}

        {/* ── STEP 6: Details ── */}
        {((step === 6 && booking.type === 'set') || (step === 5 && booking.type === 'studio')) && (
          <StepWrapper title="YOUR DETAILS">
            <div style={{ maxWidth: 480, display: 'flex', flexDirection: 'column', gap: 16 }}>
              {[
                { key: 'name',  label: 'FULL NAME',    type: 'text',  placeholder: 'Jane Smith' },
                { key: 'email', label: 'EMAIL',         type: 'email', placeholder: 'jane@studio.com' },
                { key: 'phone', label: 'PHONE (TEXT)',  type: 'tel',   placeholder: '(832) 000-0000' },
              ].map(field => (
                <div key={field.key}>
                  <label style={{ display: 'block', fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>
                    {field.label}
                  </label>
                  <input
                    type={field.type}
                    placeholder={field.placeholder}
                    value={(booking as any)[field.key]}
                    onChange={e => setBooking(b => ({ ...b, [field.key]: e.target.value }))}
                    style={{
                      width: '100%', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
                      color: '#fff', padding: '14px 16px', fontSize: 14, fontFamily: 'Inter',
                      outline: 'none', transition: 'border-color 0.2s',
                    }}
                    onFocus={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)')}
                    onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)')}
                  />
                </div>
              ))}
              <div>
                <label style={{ display: 'block', fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>
                  NOTES (OPTIONAL)
                </label>
                <textarea
                  placeholder="Anything we should know — concept, special requests, etc."
                  value={booking.notes}
                  onChange={e => setBooking(b => ({ ...b, notes: e.target.value }))}
                  rows={3}
                  style={{
                    width: '100%', background: 'transparent', border: '1px solid rgba(255,255,255,0.15)',
                    color: '#fff', padding: '14px 16px', fontSize: 14, fontFamily: 'Inter',
                    outline: 'none', resize: 'vertical',
                  }}
                  onFocus={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.5)')}
                  onBlur={e => (e.currentTarget.style.borderColor = 'rgba(255,255,255,0.15)')}
                />
              </div>

              {/* SMS Consent */}
              <div
                onClick={() => setBooking(b => ({ ...b, smsConsent: !b.smsConsent }))}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', marginTop: 8 }}
              >
                <div style={{
                  width: 18, height: 18, flexShrink: 0, marginTop: 2,
                  border: `1px solid ${booking.smsConsent ? '#fff' : 'rgba(255,255,255,0.3)'}`,
                  background: booking.smsConsent ? '#fff' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {booking.smsConsent && <span style={{ color: '#080808', fontSize: 11, lineHeight: 1 }}>✓</span>}
                </div>
                <p style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, margin: 0 }}>
                  I agree to receive text messages from Made Kulture at the number above, including booking confirmations and reminders. Msg &amp; data rates may apply. Reply STOP to opt out.{' '}
                  <a href="https://madekulture.com/terms" target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'underline' }} onClick={e => e.stopPropagation()}>Terms</a>
                  {' '}·{' '}
                  <a href="https://madekulture.com/privacy-policy" target="_blank" rel="noopener noreferrer" style={{ color: 'rgba(255,255,255,0.7)', textDecoration: 'underline' }} onClick={e => e.stopPropagation()}>Privacy Policy</a>
                </p>
              </div>

              {/* Guest count fallback (only if it wasn't captured earlier, e.g. deep link) */}
              {booking.guests == null && (
                <div style={{ marginTop: 8 }}>
                  <label style={{ display: 'block', fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>
                    HOW MANY PEOPLE TOTAL?
                  </label>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                    <button type="button" onClick={() => setBooking(b => ({ ...b, guests: Math.max(1, (b.guests ?? 1) - 1) }))}
                      style={{ width: 40, height: 40, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 18, cursor: 'pointer' }}>−</button>
                    <span style={{ fontFamily: 'Inter', fontSize: 16, color: '#fff', minWidth: 28, textAlign: 'center' }}>{booking.guests ?? 1}</span>
                    <button type="button" onClick={() => setBooking(b => ({ ...b, guests: Math.min(30, (b.guests ?? 0) + 1) }))}
                      style={{ width: 40, height: 40, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 18, cursor: 'pointer' }}>+</button>
                  </div>
                </div>
              )}

              {/* Guest-limit acknowledgment — the booking contract */}
              <div
                onClick={() => setBooking(b => ({ ...b, guestAck: !b.guestAck }))}
                style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer', marginTop: 8 }}
              >
                <div style={{
                  width: 18, height: 18, flexShrink: 0, marginTop: 2,
                  border: `1px solid ${booking.guestAck ? '#fff' : 'rgba(255,255,255,0.3)'}`,
                  background: booking.guestAck ? '#fff' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {booking.guestAck && <span style={{ color: '#080808', fontSize: 11, lineHeight: 1 }}>✓</span>}
                </div>
                <p style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.6, margin: 0 }}>
                  I confirm my party is <strong style={{ color: '#fff' }}>{booking.guests ?? '—'} {booking.guests === 1 ? 'person' : 'people'}</strong> total. I understand extra guests beyond this may be charged <strong style={{ color: '#fff' }}>${guestPricing.penaltyPerHead}/guest</strong> and can result in a note or ban on my account.
                </p>
              </div>
            </div>
            <NavRow onBack={back} onNext={next} canNext={canNext[6]} />
          </StepWrapper>
        )}

        {/* ── STEP 7 / FINAL: Confirm ── */}
        {((step === 7 && booking.type === 'set') || (step === 6 && booking.type === 'studio')) && (
          <StepWrapper title="CONFIRM & PAY">
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: isMobile ? 28 : 40 }}>

              {/* Summary */}
              <div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 24, marginBottom: 32 }}>
                  <Row label="TYPE" value={booking.type === 'studio' ? 'Full Studio Takeover' : (setCart.length > 1 ? `${setCart.length} Sets` : 'Individual Set')} />
                  {booking.type === 'studio' ? (
                    <>
                      <Row label="DATE" value={booking.date} />
                      {booking.startHour !== null && booking.endHour !== null && (
                        <Row label="TIME" value={`${fmt12(booking.startHour)} – ${fmt12(booking.endHour)} (${hourCount}hr)`} />
                      )}
                    </>
                  ) : (
                    setCart.map((it, i) => (
                      <Row key={i} label={it.setName} value={`${it.date} · ${fmt12(it.startHour)}–${fmt12(it.endHour)}`} />
                    ))
                  )}
                  {booking.guests != null && <Row label="PARTY" value={`${booking.guests} ${booking.guests === 1 ? 'person' : 'people'}`} />}
                  <Row label="NAME"    value={booking.name} />
                  <Row label="EMAIL"   value={booking.email} />
                  <Row label="PHONE"   value={booking.phone} />
                  {booking.notes && <Row label="NOTES" value={booking.notes} />}
                </div>

                {booking.equipment.length > 0 && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 24, marginBottom: 24 }}>
                    <div style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', marginBottom: 12 }}>EQUIPMENT</div>
                    {booking.equipment.map(l => (
                      <Row key={l.id} label={l.quantity > 1 ? `${l.name} × ${l.quantity}` : l.name} value={`$${l.rate * l.quantity}`} />
                    ))}
                  </div>
                )}

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 24 }}>
                  {booking.type === 'studio'
                    ? (hourCount > 0 && <Row label={`SPACE (${hourCount}hr × $${buyoutRate})`} value={`$${spaceTotal}`} />)
                    : (cartSpaceTotal > 0 && <Row label="SETS SUBTOTAL" value={`$${cartSpaceTotal}`} />)}
                  {guestFee > 0 && <Row label={`EXTRA GUESTS (${guestRec?.buffer} × $${guestPricing.perPersonFee}/hr)`} value={`$${guestFee}`} />}
                  {equipTotal > 0 && (
                    equipDiscount
                      ? <Row label={`EQUIPMENT (${equipDiscount}% off)`} value={`$${discountedEquipTotal}`} />
                      : <Row label="EQUIPMENT" value={`$${equipTotal}`} />
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
                    <span style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 22, color: '#fff', letterSpacing: '0.05em' }}>TOTAL</span>
                    <span style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 22, color: '#fff' }}>${grandTotal}</span>
                  </div>
                </div>
              </div>

              {/* Payment — or comp confirm when $0 and card-exempt */}
              {grandTotal === 0 && compNoCard ? (
                <CompConfirmPanel
                  booking={booking}
                  setCart={setCart}
                  onBack={back}
                  onSuccess={() => setSubmitted(true)}
                />
              ) : (
                <SquarePaymentPanel
                  grandTotal={grandTotal}
                  booking={booking}
                  setCart={setCart}
                  selectedSet={selectedSet}
                  hourCount={hourCount}
                  setRate={setRate}
                  onBack={back}
                  onSuccess={() => setSubmitted(true)}
                />
              )}
            </div>
          </StepWrapper>
        )}

      </div>
    </div>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function StepWrapper({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 'clamp(36px, 6vw, 72px)', color: '#fff', letterSpacing: '0.02em', marginBottom: 40, lineHeight: 0.9 }}>
        {title}
      </h1>
      {children}
    </div>
  )
}

function NavRow({ onBack, onNext, canNext, nextLabel = 'CONTINUE' }: {
  onBack: () => void; onNext: () => void; canNext: boolean; nextLabel?: string
}) {
  const isMobile = useIsMobile()
  return (
    <div style={{ display: 'flex', gap: 12, marginTop: 40, width: isMobile ? '100%' : 'auto' }}>
      <button onClick={onBack}
        style={{ flex: '0 0 auto', background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', padding: '15px 24px', cursor: 'pointer', fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.5)', transition: 'all 0.2s', whiteSpace: 'nowrap' }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.6)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.2)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)' }}
      >
        ← BACK
      </button>
      <button onClick={onNext} disabled={!canNext}
        style={{
          flex: isMobile ? 1 : '0 0 auto', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          background: canNext ? '#fff' : 'rgba(255,255,255,0.1)', border: 'none',
          padding: '15px 24px', cursor: canNext ? 'pointer' : 'not-allowed',
          fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, fontWeight: 500, letterSpacing: '0.18em',
          color: canNext ? '#080808' : 'rgba(255,255,255,0.2)', transition: 'opacity 0.2s', whiteSpace: 'nowrap',
        }}>
        {nextLabel}
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
      </button>
    </div>
  )
}

// ─── Guest count step ─────────────────────────────────────────────────────────

function GuestStep({ type, guests, pricing, buyoutRate, onChange, onBack, onContinue, onSwitchToBuyout }: {
  type: BookingType
  guests: number | null
  pricing: GuestPricing
  buyoutRate: number
  onChange: (n: number) => void
  onBack: () => void
  onContinue: () => void
  onSwitchToBuyout: () => void
}) {
  const isMobile = useIsMobile()
  const max = type === 'studio' ? 30 : 24
  const n = guests ?? 0
  const rec = guests ? recommendForGuests(guests, pricing) : null

  const dec = () => onChange(Math.max(1, n - 1))
  const inc = () => onChange(Math.min(max, n < 1 ? 1 : n + 1))

  // Guidance copy for the individual-set ladder.
  let guidance: React.ReactNode = null
  if (type === 'set' && rec) {
    if (rec.buffer > 0) {
      guidance = <>Over {pricing.capacityPerSet} on one set: <strong style={{ color: '#fff' }}>+${pricing.perPersonFee}/guest/hr</strong> for {rec.buffer} extra {rec.buffer === 1 ? 'guest' : 'guests'}, added at checkout.</>
    } else if (rec.buyout) {
      guidance = <>That&apos;s a full-warehouse production. We recommend the <strong style={{ color: '#fff' }}>Full Studio Takeover</strong> — privacy, all sets, fog/haze &amp; audio.</>
    } else if (rec.setsNeeded > 1) {
      guidance = <>You&apos;ll need <strong style={{ color: '#fff' }}>{rec.setsNeeded} sets</strong> ({pricing.capacityPerSet} people each). Add them on the next steps.</>
    } else {
      guidance = <>Fits comfortably on <strong style={{ color: '#fff' }}>one set</strong>.</>
    }
  } else if (type === 'studio') {
    guidance = n > 30
      ? <>Groups over 30 need approval — text us at (832) 408-1631.</>
      : <>Up to <strong style={{ color: '#fff' }}>30 people</strong> included in a full buyout.</>
  }

  return (
    <StepWrapper title="HOW MANY PEOPLE?">
      <div style={{ maxWidth: 520 }}>
        <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 32 }}>
          Your total party — everyone on site, including photographers, models, stylists, assistants, clients and children.
        </p>

        {/* Stepper */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginBottom: 28 }}>
          <button onClick={dec}
            style={{ width: 52, height: 52, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>−</button>
          <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 56, color: '#fff', minWidth: 80, textAlign: 'center', lineHeight: 1 }}>
            {n < 1 ? '—' : n}
          </div>
          <button onClick={inc}
            style={{ width: 52, height: 52, background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', fontSize: 24, cursor: 'pointer', lineHeight: 1 }}>+</button>
        </div>

        {guidance && (
          <div style={{ background: rec?.buyout ? 'rgba(212,168,67,0.08)' : 'rgba(255,255,255,0.04)', border: `1px solid ${rec?.buyout ? 'rgba(212,168,67,0.3)' : 'rgba(255,255,255,0.1)'}`, padding: '16px 18px', marginBottom: 24 }}>
            <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, margin: 0 }}>{guidance}</p>
            {type === 'set' && rec?.buyout && (
              <button onClick={onSwitchToBuyout}
                style={{ marginTop: 12, background: '#fff', border: 'none', color: '#080808', padding: '10px 18px', cursor: 'pointer', fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em' }}>
                SWITCH TO FULL BUYOUT
              </button>
            )}
          </div>
        )}

        <NavRow onBack={onBack} onNext={onContinue} canNext={n >= 1} />
      </div>
    </StepWrapper>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 16 }}>
      <span style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontFamily: 'Inter', fontSize: 13, color: '#fff', textAlign: 'right', minWidth: 0, overflowWrap: 'anywhere' }}>{value}</span>
    </div>
  )
}

function SuccessScreen({ booking, setCart }: { booking: BookingState; setCart: SetCartItem[] }) {
  const sessions = booking.type === 'set' ? setCart : []
  return (
    <div style={{ background: '#080808', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <div style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', marginBottom: 24 }}>BOOKING RECEIVED</div>
        <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 72, color: '#fff', lineHeight: 0.9, marginBottom: 24 }}>
          YOU&apos;RE<br />LOCKED IN.
        </h1>
        {sessions.length > 0 && (
          <div style={{ display: 'inline-block', textAlign: 'left', margin: '0 auto 28px', padding: '16px 20px', background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)' }}>
            {sessions.map((it, i) => (
              <div key={i} style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.75)', padding: '3px 0' }}>
                <strong style={{ color: '#fff' }}>{it.setName}</strong> — {it.date}, {fmt12(it.startHour)}–{fmt12(it.endHour)}
              </div>
            ))}
          </div>
        )}
        <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, marginBottom: 40 }}>
          Confirmation details will be sent to <strong style={{ color: '#fff' }}>{booking.email}</strong>. You&apos;ll also receive a text at {booking.phone} with everything you need.
        </p>
        <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.3)', lineHeight: 1.6, marginBottom: 48 }}>
          Questions? Text us at <strong style={{ color: '#fff' }}>(832) 408-1631</strong>
        </p>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '14px 28px', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', textDecoration: 'none', fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, fontWeight: 500, letterSpacing: '0.18em' }}>
          BACK TO HOME
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/></svg>
        </Link>
      </div>
    </div>
  )
}

// ─── Square Payment Panel ─────────────────────────────────────────────────────

// Comp ($0, card-exempt) checkout — confirms the booking with no card.
function CompConfirmPanel({ booking, setCart, onBack, onSuccess }: {
  booking: BookingState; setCart: SetCartItem[]; onBack: () => void; onSuccess: () => void
}) {
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async () => {
    setSubmitting(true); setError(null)
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type:      booking.type,
          sets:      booking.type === 'set'
                       ? setCart.map(it => ({ setSlug: it.setId, date: it.date, startHour: it.startHour, endHour: it.endHour }))
                       : undefined,
          setSlug:   booking.setId,
          date:      booking.date,
          startHour: booking.startHour,
          endHour:   booking.endHour,
          equipment: booking.equipment.map(l => ({ equipment_id: l.id, quantity: l.quantity })),
          name:      booking.name,
          email:     booking.email,
          phone:     booking.phone,
          notes:     booking.notes,
          guests:    booking.guests,
          totalCents: 0,
        }),
      })
      const data = await res.json()
      if (!res.ok) { setError(data.error || 'Could not confirm booking.'); setSubmitting(false); return }
      onSuccess()
    } catch {
      setError('Could not confirm booking. Please try again.'); setSubmitting(false)
    }
  }

  return (
    <div>
      <div style={{ background: 'rgba(212,168,67,0.08)', border: '1px solid rgba(212,168,67,0.3)', padding: '18px 20px', marginBottom: 20 }}>
        <div style={{ fontFamily: 'Inter', fontSize: 13, color: '#fff', marginBottom: 4 }}>No payment due</div>
        <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.55)', lineHeight: 1.6 }}>
          This booking is comped — your total is $0 and no card is required.
        </div>
      </div>
      {error && <div style={{ color: '#f0a0a0', fontSize: 13, marginBottom: 16 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 12 }}>
        <button onClick={onBack} disabled={submitting}
          style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: '#fff', padding: '15px 24px', cursor: 'pointer', fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, letterSpacing: '0.18em' }}>
          ← BACK
        </button>
        <button onClick={submit} disabled={submitting}
          style={{ flex: 1, background: '#fff', border: 'none', color: '#080808', padding: '15px 24px', cursor: submitting ? 'default' : 'pointer', fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', opacity: submitting ? 0.6 : 1 }}>
          {submitting ? 'CONFIRMING…' : 'CONFIRM BOOKING'}
        </button>
      </div>
    </div>
  )
}

interface SquarePaymentPanelProps {
  grandTotal:  number
  booking:     BookingState
  setCart:     SetCartItem[]
  selectedSet: any
  hourCount:   number
  setRate:     number
  onBack:      () => void
  onSuccess:   () => void
}

function SquarePaymentPanel({ grandTotal, booking, setCart, selectedSet, hourCount, setRate, onBack, onSuccess }: SquarePaymentPanelProps) {
  const isMobile = useIsMobile()
  const cardContainerRef    = useRef<HTMLDivElement>(null)
  const googlePayContainerRef = useRef<HTMLDivElement>(null)
  const cardRef             = useRef<any>(null)
  const grandTotalRef       = useRef(grandTotal) // stable ref for async callbacks
  const [sdkReady,       setSdkReady]       = useState(false)
  const [sdkError,       setSdkError]       = useState<string | null>(null)
  const [googlePayReady, setGooglePayReady] = useState(false)
  const [paying,         setPaying]         = useState(false)
  const [payError,       setPayError]       = useState<string | null>(null)

  useEffect(() => { grandTotalRef.current = grandTotal }, [grandTotal])

  // Shared booking submission used by both card and Google Pay
  const submitBooking = async (sourceId: string) => {
    setPaying(true)
    setPayError(null)
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId,
          type:       booking.type,
          // Multi-set order: one line item per set, each with its own date/time.
          sets:       booking.type === 'set'
                        ? setCart.map(it => ({ setSlug: it.setId, date: it.date, startHour: it.startHour, endHour: it.endHour }))
                        : undefined,
          // Legacy single-set / studio fields (studio uses these):
          setSlug:    booking.setId,
          date:       booking.date,
          startHour:  booking.startHour,
          endHour:    booking.endHour,
          equipment:  booking.equipment.map(l => ({ equipment_id: l.id, quantity: l.quantity })),
          name:       booking.name,
          email:      booking.email,
          phone:      booking.phone,
          notes:      booking.notes,
          guests:     booking.guests,
          totalCents: grandTotalRef.current * 100,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPayError(data.error || 'Payment failed. Please try again.')
        setPaying(false)
        return
      }
      try { localStorage.removeItem('mk_gear_cart') } catch {}
      onSuccess()
    } catch {
      setPayError('Something went wrong. Please try again.')
      setPaying(false)
    }
  }

  // Load Square SDK, mount card + Google Pay
  useEffect(() => {
    let mounted = true
    loadSquareScript()
      .then(async () => {
        if (!mounted) return
        const appId      = process.env.NEXT_PUBLIC_SQUARE_APP_ID!
        const locationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID!

        if (!appId || !locationId) {
          setSdkError('Square credentials not configured. Add NEXT_PUBLIC_SQUARE_APP_ID and NEXT_PUBLIC_SQUARE_LOCATION_ID to .env.local')
          return
        }

        const payments = window.Square.payments(appId, locationId)

        // Card
        if (cardContainerRef.current) {
          const card = await payments.card()
          await card.attach(cardContainerRef.current)
          cardRef.current = card
        }

        // Google Pay (silently skip if unsupported)
        try {
          const paymentRequest = payments.paymentRequest({
            countryCode:  'US',
            currencyCode: 'USD',
            total: { amount: grandTotalRef.current.toFixed(2), label: 'Made Kulture Studio' },
          })
          const googlePay = await payments.googlePay(paymentRequest)
          await googlePay.attach('#google-pay-button')
          if (mounted) setGooglePayReady(true)
          googlePay.addEventListener('ontokenization', (event: any) => {
            const { tokenResult } = event.detail
            if (tokenResult.status === 'OK') submitBooking(tokenResult.token)
            else setPayError(tokenResult.errors?.[0]?.message || 'Google Pay failed')
          })
        } catch {
          // Google Pay not available on this device/browser — card form is the fallback
        }

        if (mounted) setSdkReady(true)
      })
      .catch(err => { if (mounted) setSdkError(err.message) })

    return () => { mounted = false }
  }, []) // eslint-disable-line

  const handlePay = async () => {
    if (!cardRef.current) return
    setPaying(true)
    setPayError(null)
    try {
      const result = await cardRef.current.tokenize()
      if (result.status !== 'OK') {
        setPayError(result.errors?.[0]?.message || 'Card error. Please check your details.')
        setPaying(false)
        return
      }
      await submitBooking(result.token)
    } catch {
      setPayError('Something went wrong. Please try again.')
      setPaying(false)
    }
  }

  return (
    <div>
      <div style={{ border: '1px solid rgba(255,255,255,0.1)', padding: isMobile ? 18 : 32 }}>
        <div style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.3)', marginBottom: 24 }}>
          PAYMENT — SECURED BY SQUARE
        </div>

        {sdkError ? (
          <div style={{ fontFamily: 'Inter', fontSize: 12, color: '#ff6b6b', lineHeight: 1.6, marginBottom: 24, padding: '12px 16px', border: '1px solid rgba(255,100,100,0.2)', background: 'rgba(255,100,100,0.05)' }}>
            {sdkError}
          </div>
        ) : (
          <>
            {/* Google Pay button (auto-hides if unsupported) */}
            <div ref={googlePayContainerRef} style={{ marginBottom: googlePayReady ? 16 : 0 }}>
              <div id="google-pay-button" />
            </div>
            {googlePayReady && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
                <span style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.1em' }}>OR PAY WITH CARD</span>
                <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,0.1)' }} />
              </div>
            )}

            {/* Square card fields mount here */}
            <div style={{ background: '#fff', padding: '4px 0', marginBottom: 24 }}>
              <div ref={cardContainerRef} style={{ minHeight: 89 }}>
                {!sdkReady && (
                  <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(0,0,0,0.3)', letterSpacing: '0.1em', padding: '14px 16px' }}>
                    LOADING CARD FIELDS...
                  </div>
                )}
              </div>
            </div>

            {payError && (
              <div style={{ fontFamily: 'Inter', fontSize: 12, color: '#ff6b6b', marginBottom: 16, padding: '10px 14px', border: '1px solid rgba(255,100,100,0.2)', background: 'rgba(255,100,100,0.05)' }}>
                {payError}
              </div>
            )}

            <div style={{ fontFamily: 'Inter', fontSize: 10, color: 'rgba(255,255,255,0.2)', letterSpacing: '0.08em', marginBottom: 20 }}>
              YOUR CARD WILL BE CHARGED ${grandTotal} AND SAVED ON FILE FOR ANY OVERAGES.
            </div>

            <button
              onClick={handlePay}
              disabled={!sdkReady || paying}
              style={{
                width: '100%',
                background: (!sdkReady || paying) ? 'rgba(255,255,255,0.5)' : '#fff',
                border: 'none', padding: '16px', cursor: (!sdkReady || paying) ? 'wait' : 'pointer',
                fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', color: '#080808',
                transition: 'background 0.2s',
              }}
            >
              {paying ? 'PROCESSING...' : `CONFIRM & PAY $${grandTotal}`}
            </button>
          </>
        )}
      </div>

      <button onClick={onBack} style={{ background: 'transparent', border: 'none', cursor: 'pointer', marginTop: 16, fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.12em', color: 'rgba(255,255,255,0.3)' }}>
        ← BACK
      </button>
    </div>
  )
}

const STEP_LABELS: Record<number, string> = {
  1: 'BOOKING TYPE',
  2: 'SELECT SET',
  3: 'PICK A DATE',
  4: 'SELECT TIME',
  5: 'EQUIPMENT',
  6: 'YOUR DETAILS',
  7: 'CONFIRM',
}

// ─── Export (wrapped in Suspense for useSearchParams) ─────────────────────────

export default function BookPage() {
  return (
    <Suspense fallback={<div style={{ background: '#080808', minHeight: '100vh' }} />}>
      <BookingWizard />
    </Suspense>
  )
}
