'use client'
import { useState, useEffect, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import Link from 'next/link'

// ─── Square SDK loader ────────────────────────────────────────────────────────

declare global {
  interface Window { Square?: any }
}

function loadSquareScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.Square) { resolve(); return }
    const src = process.env.NEXT_PUBLIC_SQUARE_ENVIRONMENT === 'production'
      ? 'https://web.squarecdn.com/v1/square.js'
      : 'https://sandbox.web.squarecdn.com/v1/square.js'
    const script = document.createElement('script')
    script.src = src
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Failed to load Square.js'))
    document.head.appendChild(script)
  })
}

// ─── Data ────────────────────────────────────────────────────────────────────

const SETS = [
  { id: 'set-a',           name: 'Set A',             price: 40,  desc: '12×15ft white cinderblock walls, large windows',   minHours: 1 },
  { id: 'set-b',           name: 'Set B',             price: 40,  desc: '12×14ft faux brush walls, duo color smooth walls', minHours: 1 },
  { id: 'set-c',           name: 'Set C',             price: 40,  desc: '12×14ft white walls, 20ft red vinyl backdrop',     minHours: 1 },
  { id: 'set-d',           name: 'Set D',             price: 40,  desc: '12×15ft bare cinderblock, concrete floor',         minHours: 1 },
  { id: 'concrete',        name: 'Concrete',          price: 40,  desc: '12×16ft faux concrete walls, mirror wall',         minHours: 1 },
  { id: 'vintage',         name: 'Vintage',           price: 40,  desc: '12×16ft vintage aesthetic',                        minHours: 1 },
  { id: 'cottage',         name: 'Cottage',           price: 40,  desc: '12×16ft slate walls, faux wood flooring',          minHours: 1 },
  { id: 'watering-hole',   name: 'The Watering Hole', price: 75,  desc: '12×16×13 shallow black pool',                      minHours: 2 },
  { id: 'studio-one',      name: 'Studio One',        price: 65,  desc: 'Large open warehouse aesthetic, up to 30 people',  minHours: 1 },
]

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

const HOURS = Array.from({ length: 13 }, (_, i) => i + 9) // 9–21 (9am–9pm start slots)
const STUDIO_PRICE = 400 // placeholder buyout flat rate per hour discussion
const CLOSE_HOUR = 22 // 10pm

function fmt12(h: number) {
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12  = h % 12 === 0 ? 12 : h % 12
  return `${h12}${ampm}`
}

function today() {
  const d = new Date()
  // Require 48hr advance booking
  d.setDate(d.getDate() + 2)
  return d.toISOString().split('T')[0]
}

// ─── Types ───────────────────────────────────────────────────────────────────

type BookingType = 'set' | 'studio'

interface BookingState {
  type:        BookingType | null
  setId:       string | null
  date:        string
  startHour:   number | null
  endHour:     number | null   // exclusive — endHour=14 means session ends at 2pm
  equipment:   string[]
  name:        string
  email:       string
  phone:       string
  notes:       string
  smsConsent:  boolean
}

// ─── Main Component ──────────────────────────────────────────────────────────

function BookingWizard() {
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
    setId:     setParam || null,
    date:      dateParam || today(),
    startHour: startParam ? parseInt(startParam) : null,
    endHour:   null,
    equipment: [],
    name: '', email: '', phone: '', notes: '', smsConsent: false,
  })
  const [bookedSlots, setBookedSlots] = useState<{ start: number; end: number }[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [submitted, setSubmitted] = useState(false)

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

  const selectedSet  = SETS.find(s => s.id === booking.setId)
  const hourCount    = booking.startHour !== null && booking.endHour !== null
                       ? booking.endHour - booking.startHour : 0
  const setRate      = selectedSet?.price ?? 65
  const equipTotal   = booking.equipment.reduce((sum, id) => {
    const eq = EQUIPMENT.find(e => e.id === id)
    return sum + (eq?.price ?? 0)
  }, 0)
  const spaceTotal   = booking.type === 'studio'
                       ? (STUDIO_PRICE * hourCount)
                       : (setRate * hourCount)
  const grandTotal   = spaceTotal + equipTotal

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
    h >= booking.startHour && h < booking.endHour

  const isStart = (h: number) => h === booking.startHour
  const isEnd   = (h: number) => booking.endHour !== null && h === booking.endHour - 1

  // ── Steps ──────────────────────────────────────────────────────────────────

  const totalSteps = booking.type === 'studio' ? 6 : 7

  const canNext: Record<number, boolean> = {
    1: booking.type !== null,
    2: booking.type === 'studio' ? true : booking.setId !== null,
    3: booking.date !== '',
    4: booking.startHour !== null && booking.endHour !== null,
    5: true, // equipment optional
    6: booking.name !== '' && booking.email !== '' && booking.phone !== '' && booking.smsConsent,
  }

  const next = () => setStep(s => s + 1)
  const back = () => setStep(s => s - 1)

  // Adjust step labels for studio (no set selection step)
  const effectiveStep = booking.type === 'studio' && step >= 2 ? step - 1 : step

  // ── Render ─────────────────────────────────────────────────────────────────

  if (submitted) return <SuccessScreen booking={booking} selectedSet={selectedSet} />

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
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 20, letterSpacing: '0.05em', color: '#fff', lineHeight: 1 }}>
            MADE<br />KULTURE
          </div>
        </Link>
        <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.4)' }}>
          BOOK A SESSION
        </div>
      </nav>

      <div style={{ maxWidth: 960, margin: '0 auto', padding: '120px 40px 80px' }}>

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
        {step === 1 && (
          <StepWrapper title="HOW WOULD YOU LIKE TO BOOK?">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, background: 'rgba(255,255,255,0.06)' }}>
              {[
                { type: 'set' as BookingType,    label: 'INDIVIDUAL SET',        sub: 'Reserve one set by the hour. Up to 5 people. $40–$75/hr.', price: 'FROM $40/HR' },
                { type: 'studio' as BookingType, label: 'FULL STUDIO TAKEOVER',  sub: 'Entire warehouse — all sets, private. Up to 30 people.', price: 'CONTACT FOR RATE' },
              ].map(opt => (
                <button key={opt.type} onClick={() => { setBooking(b => ({ ...b, type: opt.type })); setStep(2) }}
                  style={{
                    background: booking.type === opt.type ? '#fff' : '#0d0d0d',
                    border: 'none', padding: '60px 48px', cursor: 'pointer', textAlign: 'left',
                    transition: 'background 0.2s',
                  }}
                  onMouseEnter={e => { if (booking.type !== opt.type) (e.currentTarget as HTMLButtonElement).style.background = '#111' }}
                  onMouseLeave={e => { if (booking.type !== opt.type) (e.currentTarget as HTMLButtonElement).style.background = '#0d0d0d' }}
                >
                  <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 36, color: booking.type === opt.type ? '#080808' : '#fff', letterSpacing: '0.02em', marginBottom: 12 }}>
                    {opt.label}
                  </div>
                  <p style={{ fontFamily: 'Inter', fontSize: 13, color: booking.type === opt.type ? 'rgba(0,0,0,0.6)' : 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 24 }}>
                    {opt.sub}
                  </p>
                  <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: booking.type === opt.type ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.3)' }}>
                    {opt.price}
                  </div>
                </button>
              ))}
            </div>
          </StepWrapper>
        )}

        {/* ── STEP 2: Set selection (individual only) ── */}
        {step === 2 && booking.type === 'set' && (
          <StepWrapper title="CHOOSE YOUR SET">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 1, background: 'rgba(255,255,255,0.06)' }}>
              {SETS.map(s => (
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
                  <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 26, color: booking.setId === s.id ? '#080808' : '#fff', letterSpacing: '0.02em', marginBottom: 6 }}>
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
              <input
                type="date"
                value={booking.date}
                min={today()}
                onChange={e => {
                  setBooking(b => ({ ...b, date: e.target.value, startHour: null, endHour: null }))
                  setBookedSlots([])
                }}
                style={{
                  background: 'transparent', border: '1px solid rgba(255,255,255,0.2)',
                  color: '#fff', padding: '16px 20px', fontSize: 16,
                  fontFamily: 'Inter', width: '100%', cursor: 'pointer',
                  outline: 'none', colorScheme: 'dark',
                }}
              />
            </div>
            <NavRow onBack={back} onNext={next} canNext={canNext[3]} />
          </StepWrapper>
        )}

        {/* ── STEP 4: Time ── */}
        {((step === 4 && booking.type === 'set') || (step === 3 && booking.type === 'studio')) && (
          <StepWrapper title="SELECT YOUR TIME">
            <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 8 }}>
              {booking.startHour === null
                ? 'Click your start time, then click your end time.'
                : booking.endHour === null
                  ? `Start: ${fmt12(booking.startHour)} — now click your end time.`
                  : `${fmt12(booking.startHour)} – ${fmt12(booking.endHour)} · ${hourCount} hour${hourCount !== 1 ? 's' : ''}`
              }
            </p>
            {loadingSlots && (
              <p style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', marginBottom: 16 }}>
                CHECKING AVAILABILITY...
              </p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 32 }}>
              {HOURS.map(h => {
                const booked   = isHourBooked(h)
                const inRange  = isInRange(h)
                const start    = isStart(h)
                const end      = isEnd(h)
                const isPending = booking.startHour === h && booking.endHour === null

                let bg = '#0d0d0d'
                let color = 'rgba(255,255,255,0.6)'
                if (booked)    { bg = '#0d0d0d'; color = 'rgba(255,255,255,0.12)' }
                if (inRange)   { bg = 'rgba(255,255,255,0.12)'; color = '#fff' }
                if (start || end) { bg = '#fff'; color = '#080808' }
                if (isPending) { bg = 'rgba(255,255,255,0.2)'; color = '#fff' }

                return (
                  <button key={h} onClick={() => handleHourClick(h)} disabled={booked}
                    style={{
                      background: bg, border: 'none', padding: '16px 8px', cursor: booked ? 'not-allowed' : 'pointer',
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
            <NavRow onBack={back} onNext={next} canNext={canNext[4]} />
          </StepWrapper>
        )}

        {/* ── STEP 5: Add-ons ── */}
        {((step === 5 && booking.type === 'set') || (step === 4 && booking.type === 'studio')) && (
          <StepWrapper title="ADD EQUIPMENT">
            <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.4)', lineHeight: 1.6, marginBottom: 32 }}>
              All equipment is in-studio only. Your set already includes one Amaran 200x light. Add extras below.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 32 }}>
              {EQUIPMENT.map(eq => {
                const selected = booking.equipment.includes(eq.id)
                return (
                  <button key={eq.id}
                    onClick={() => setBooking(b => ({
                      ...b,
                      equipment: selected
                        ? b.equipment.filter(id => id !== eq.id)
                        : [...b.equipment, eq.id],
                    }))}
                    style={{
                      background: selected ? 'rgba(255,255,255,0.08)' : '#0d0d0d',
                      border: 'none', padding: '20px 24px', cursor: 'pointer', textAlign: 'left',
                      display: 'flex', alignItems: 'center', gap: 16, transition: 'background 0.15s',
                    }}
                    onMouseEnter={e => { if (!selected) (e.currentTarget as HTMLButtonElement).style.background = '#111' }}
                    onMouseLeave={e => { if (!selected) (e.currentTarget as HTMLButtonElement).style.background = '#0d0d0d' }}
                  >
                    <div style={{
                      width: 18, height: 18, border: `1px solid ${selected ? '#fff' : 'rgba(255,255,255,0.25)'}`,
                      background: selected ? '#fff' : 'transparent', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      {selected && <span style={{ color: '#080808', fontSize: 11, lineHeight: 1 }}>✓</span>}
                    </div>
                    <div>
                      <div style={{ fontFamily: 'Inter', fontSize: 13, color: '#fff', marginBottom: 2 }}>{eq.name}</div>
                      <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.08em' }}>${eq.price}</div>
                    </div>
                  </button>
                )
              })}
            </div>
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
            </div>
            <NavRow onBack={back} onNext={next} canNext={canNext[6]} />
          </StepWrapper>
        )}

        {/* ── STEP 7 / FINAL: Confirm ── */}
        {((step === 7 && booking.type === 'set') || (step === 6 && booking.type === 'studio')) && (
          <StepWrapper title="CONFIRM & PAY">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 40 }}>

              {/* Summary */}
              <div>
                <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 24, marginBottom: 32 }}>
                  <Row label="TYPE"    value={booking.type === 'studio' ? 'Full Studio Takeover' : 'Individual Set'} />
                  {selectedSet && <Row label="SET"   value={selectedSet.name} />}
                  <Row label="DATE"    value={booking.date} />
                  {booking.startHour !== null && booking.endHour !== null && (
                    <Row label="TIME" value={`${fmt12(booking.startHour)} – ${fmt12(booking.endHour)} (${hourCount}hr)`} />
                  )}
                  <Row label="NAME"    value={booking.name} />
                  <Row label="EMAIL"   value={booking.email} />
                  <Row label="PHONE"   value={booking.phone} />
                  {booking.notes && <Row label="NOTES" value={booking.notes} />}
                </div>

                {booking.equipment.length > 0 && (
                  <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 24, marginBottom: 24 }}>
                    <div style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.3)', marginBottom: 12 }}>EQUIPMENT</div>
                    {booking.equipment.map(id => {
                      const eq = EQUIPMENT.find(e => e.id === id)
                      return eq ? <Row key={id} label={eq.name} value={`$${eq.price}`} /> : null
                    })}
                  </div>
                )}

                <div style={{ borderTop: '1px solid rgba(255,255,255,0.15)', paddingTop: 24 }}>
                  {hourCount > 0 && (
                    <Row label={`SPACE (${hourCount}hr × $${booking.type === 'studio' ? STUDIO_PRICE : setRate})`} value={`$${spaceTotal}`} />
                  )}
                  {equipTotal > 0 && <Row label="EQUIPMENT" value={`$${equipTotal}`} />}
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12 }}>
                    <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, color: '#fff', letterSpacing: '0.05em' }}>TOTAL</span>
                    <span style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, color: '#fff' }}>${grandTotal}</span>
                  </div>
                </div>
              </div>

              {/* Square Payment Panel */}
              <SquarePaymentPanel
                grandTotal={grandTotal}
                booking={booking}
                selectedSet={selectedSet}
                hourCount={hourCount}
                setRate={setRate}
                onBack={back}
                onSuccess={() => setSubmitted(true)}
              />
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
      <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 'clamp(36px, 6vw, 72px)', color: '#fff', letterSpacing: '0.02em', marginBottom: 40, lineHeight: 0.9 }}>
        {title}
      </h1>
      {children}
    </div>
  )
}

function NavRow({ onBack, onNext, canNext, nextLabel = 'CONTINUE' }: {
  onBack: () => void; onNext: () => void; canNext: boolean; nextLabel?: string
}) {
  return (
    <div style={{ display: 'flex', gap: 16, marginTop: 40 }}>
      <button onClick={onBack}
        style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', padding: '14px 28px', cursor: 'pointer', fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.5)', transition: 'all 0.2s' }}
        onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.6)'; (e.currentTarget as HTMLButtonElement).style.color = '#fff' }}
        onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.2)'; (e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.5)' }}
      >
        ← BACK
      </button>
      <button onClick={onNext} disabled={!canNext}
        style={{
          background: canNext ? '#fff' : 'rgba(255,255,255,0.1)', border: 'none',
          padding: '14px 32px', cursor: canNext ? 'pointer' : 'not-allowed',
          fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.18em',
          color: canNext ? '#080808' : 'rgba(255,255,255,0.2)', transition: 'opacity 0.2s',
        }}>
        {nextLabel} ↗
      </button>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12, gap: 16 }}>
      <span style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.35)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontFamily: 'Inter', fontSize: 13, color: '#fff', textAlign: 'right' }}>{value}</span>
    </div>
  )
}

function SuccessScreen({ booking, selectedSet }: { booking: BookingState; selectedSet: any }) {
  return (
    <div style={{ background: '#080808', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 40 }}>
      <div style={{ maxWidth: 480, textAlign: 'center' }}>
        <div style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.3)', marginBottom: 24 }}>BOOKING RECEIVED</div>
        <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 72, color: '#fff', lineHeight: 0.9, marginBottom: 24 }}>
          YOU&apos;RE<br />LOCKED IN.
        </h1>
        <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, marginBottom: 40 }}>
          Confirmation details will be sent to <strong style={{ color: '#fff' }}>{booking.email}</strong>. You&apos;ll also receive a text at {booking.phone} with everything you need.
        </p>
        <p style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.3)', lineHeight: 1.6, marginBottom: 48 }}>
          Questions? Text us at <strong style={{ color: '#fff' }}>(832) 408-1631</strong>
        </p>
        <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '14px 28px', border: '1px solid rgba(255,255,255,0.3)', color: '#fff', textDecoration: 'none', fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.18em' }}>
          BACK TO HOME ↗
        </Link>
      </div>
    </div>
  )
}

// ─── Square Payment Panel ─────────────────────────────────────────────────────

interface SquarePaymentPanelProps {
  grandTotal:  number
  booking:     BookingState
  selectedSet: any
  hourCount:   number
  setRate:     number
  onBack:      () => void
  onSuccess:   () => void
}

function SquarePaymentPanel({ grandTotal, booking, selectedSet, hourCount, setRate, onBack, onSuccess }: SquarePaymentPanelProps) {
  const cardContainerRef = useRef<HTMLDivElement>(null)
  const cardRef          = useRef<any>(null)
  const [sdkReady,  setSdkReady]  = useState(false)
  const [sdkError,  setSdkError]  = useState<string | null>(null)
  const [paying,    setPaying]    = useState(false)
  const [payError,  setPayError]  = useState<string | null>(null)

  // Load Square SDK and mount card element
  useEffect(() => {
    let mounted = true
    loadSquareScript()
      .then(async () => {
        if (!mounted || !cardContainerRef.current) return
        const appId     = process.env.NEXT_PUBLIC_SQUARE_APP_ID!
        const locationId = process.env.NEXT_PUBLIC_SQUARE_LOCATION_ID!

        if (!appId || !locationId) {
          setSdkError('Square credentials not configured. Add NEXT_PUBLIC_SQUARE_APP_ID and NEXT_PUBLIC_SQUARE_LOCATION_ID to .env.local')
          return
        }

        const payments = window.Square.payments(appId, locationId)
        const card = await payments.card()
        await card.attach(cardContainerRef.current)
        cardRef.current = card
        if (mounted) setSdkReady(true)
      })
      .catch(err => {
        if (mounted) setSdkError(err.message)
      })

    return () => { mounted = false }
  }, [])

  const handlePay = async () => {
    if (!cardRef.current) return
    setPaying(true)
    setPayError(null)

    try {
      // Tokenize card
      const result = await cardRef.current.tokenize()
      if (result.status !== 'OK') {
        setPayError(result.errors?.[0]?.message || 'Card error. Please check your details.')
        setPaying(false)
        return
      }

      const sourceId = result.token

      // POST to our booking API
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceId,
          type:       booking.type,
          setSlug:    booking.setId,
          date:       booking.date,
          startHour:  booking.startHour,
          endHour:    booking.endHour,
          equipment:  booking.equipment,
          name:       booking.name,
          email:      booking.email,
          phone:      booking.phone,
          notes:      booking.notes,
          totalCents: grandTotal * 100,
        }),
      })

      const data = await res.json()

      if (!res.ok) {
        setPayError(data.error || 'Payment failed. Please try again.')
        setPaying(false)
        return
      }

      onSuccess()
    } catch (err: any) {
      setPayError('Something went wrong. Please try again.')
      setPaying(false)
    }
  }

  return (
    <div>
      <div style={{ border: '1px solid rgba(255,255,255,0.1)', padding: 32 }}>
        <div style={{ fontFamily: 'Inter', fontSize: 10, fontWeight: 500, letterSpacing: '0.18em', color: 'rgba(255,255,255,0.3)', marginBottom: 24 }}>
          PAYMENT — SECURED BY SQUARE
        </div>

        {sdkError ? (
          <div style={{ fontFamily: 'Inter', fontSize: 12, color: '#ff6b6b', lineHeight: 1.6, marginBottom: 24, padding: '12px 16px', border: '1px solid rgba(255,100,100,0.2)', background: 'rgba(255,100,100,0.05)' }}>
            {sdkError}
          </div>
        ) : (
          <>
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
