'use client'
import { useState, useEffect, Fragment } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import NavAuthLink from '@/components/NavAuthLink'
import SiteNav from '@/components/SiteNav'
import { useIsMobile } from '@/lib/use-is-mobile'
import { shortNoticeActive, todayDateStr } from '@/lib/short-notice'

// ─── Data ─────────────────────────────────────────────────────────────────────

const SETS = [
  { slug: 'set-a',         name: 'Set A',             price: 40  },
  { slug: 'set-b',         name: 'Set B',             price: 40  },
  { slug: 'set-c',         name: 'Set C',             price: 40  },
  { slug: 'set-d',         name: 'Set D',             price: 40  },
  { slug: 'concrete',      name: 'Concrete',          price: 40  },
  { slug: 'vintage',       name: 'Vintage',           price: 40  },
  { slug: 'cottage',       name: 'Cottage',           price: 40  },
  { slug: 'watering-hole', name: 'The Watering Hole', price: 75  },
  { slug: 'the-tank',      name: 'The Tank',          price: 75  },
  { slug: 'studio-one',    name: 'Studio One',        price: 65  },
]

// 9:00AM–9:30PM in 30-min steps (studio closes 10PM so last bookable start = 9:30PM)
const SLOTS = Array.from({ length: 26 }, (_, i) => 9 + i * 0.5)

function fmt12(h: number) {
  const hour = Math.floor(h)
  const half = h % 1 !== 0
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12  = hour % 12 === 0 ? 12 : hour % 12
  // Whole hours show AM/PM; half hours show ":30" without AM/PM for compactness
  return half ? `${h12}:30` : `${h12}${ampm}`
}

// Full clock label for the mobile booking list, e.g. "10:00 AM", "10:30 AM"
function fmtFull(h: number) {
  const hour = Math.floor(h)
  const mins = h % 1 !== 0 ? '30' : '00'
  const ampm = hour >= 12 ? 'PM' : 'AM'
  const h12  = hour % 12 === 0 ? 12 : hour % 12
  return `${h12}:${mins} ${ampm}`
}

// Column labels for the mobile overview heatmap — shown vertically so the grid
// columns stay narrow while the names stay readable.
const CODES: Record<string, string> = {
  'set-a': 'SET A', 'set-b': 'SET B', 'set-c': 'SET C', 'set-d': 'SET D',
  'concrete': 'CONCRETE', 'vintage': 'VINTAGE', 'cottage': 'COTTAGE',
  'watering-hole': 'WATER HOLE', 'the-tank': 'THE TANK', 'studio-one': 'STUDIO ONE',
}

// Whole-hour rows for the compact overview (9AM–9PM)
const HOURS = Array.from({ length: 13 }, (_, i) => 9 + i)

function minDate() {
  const d = new Date()
  d.setDate(d.getDate() + 2) // 48hr advance booking
  return d.toISOString().split('T')[0]
}

function formatDateLabel(dateStr: string) {
  const d = new Date(dateStr + 'T12:00:00') // avoid TZ shift on date-only strings
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface SetData {
  name: string
  bookedSlots: { start: number; end: number }[]
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function AvailabilityPage() {
  const router  = useRouter()
  const isMobile = useIsMobile()
  // Default to the 48-hr minimum; relaxed to today for customers with active
  // short-notice access (checked once their profile loads below).
  const [min, setMin]             = useState(minDate())
  const [date, setDate]           = useState(min)
  const [sets, setSets]           = useState<Record<string, SetData>>({})
  const [fullStudioSlots, setFullStudioSlots] = useState<{ start: number; end: number }[]>([])
  const [loading, setLoading]     = useState(true)
  const [menuOpen, setMenuOpen]   = useState(false)
  const [mobileSet, setMobileSet] = useState('set-a')

  useEffect(() => {
    setLoading(true)
    fetch(`/api/availability?date=${date}`)
      .then(r => r.json())
      .then(d => {
        setSets(d.sets ?? {})
        setFullStudioSlots(d.fullStudioSlots ?? [])
        setLoading(false)
      })
      .catch(() => setLoading(false))
  }, [date])

  // Unlock same-day availability for a logged-in customer with active short-notice.
  useEffect(() => {
    fetch('/api/account/profile')
      .then(r => r.ok ? r.json() : null)
      .then(d => {
        if (d && shortNoticeActive(d.pricingOverrides)) {
          const t = todayDateStr()
          setMin(t)
          setDate(t)
        }
      })
      .catch(() => {})
  }, [])

  const stepDate = (delta: number) => {
    const d = new Date(date + 'T12:00:00')
    d.setDate(d.getDate() + delta)
    const next = d.toISOString().split('T')[0]
    if (next >= min) setDate(next)
  }

  const isBooked = (slug: string, slot: number) => {
    // A 30-min slot is booked if any booking overlaps [slot, slot+0.5)
    if (fullStudioSlots.some(b => slot < b.end && slot + 0.5 > b.start)) return true
    const setData = sets[slug]
    if (!setData) return false
    return setData.bookedSlots.some(b => slot < b.end && slot + 0.5 > b.start)
  }

  const handleCell = (slug: string, slot: number) => {
    if (isBooked(slug, slot)) return
    router.push(`/book?type=set&set=${slug}&date=${date}&start=${slot}`)
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  const cellBase: React.CSSProperties = {
    height: 30,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 3,
    fontSize: 10,
    fontWeight: 600,
    letterSpacing: '0.05em',
    transition: 'all 0.15s',
    userSelect: 'none',
  }

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#fff' }}>

      {/* NAV */}
      <SiteNav active="availability" />

      {/* PAGE */}
      <div style={{ paddingTop: isMobile ? 104 : 120, paddingBottom: 80, paddingLeft: isMobile ? 16 : 40, paddingRight: isMobile ? 16 : 40, maxWidth: 1400, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>
            STUDIO AVAILABILITY
          </div>
          <h1 style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 56, letterSpacing: '0.02em', margin: 0, lineHeight: 1 }}>
            CHECK WHAT'S OPEN
          </h1>
          <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 16, maxWidth: 500 }}>
            Pick a date to see real-time availability across all 10 sets. Click any open slot to book it instantly.
          </p>
        </div>

        {/* Date picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 40, flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 8 }}>
              SELECT DATE
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <button
                onClick={() => stepDate(-1)}
                disabled={date <= min}
                style={{
                  background: '#141414', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 4, width: 40, height: 44,
                  color: date <= min ? 'rgba(255,255,255,0.2)' : '#fff',
                  fontSize: 18, cursor: date <= min ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}
              >‹</button>
              <input
                type="date"
                value={date}
                min={min}
                onChange={e => setDate(e.target.value)}
                style={{
                  background: '#141414', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 4, padding: '12px 16px',
                  fontFamily: 'Inter', fontSize: 14, color: '#fff',
                  outline: 'none', cursor: 'pointer',
                  colorScheme: 'dark',
                }}
              />
              <button
                onClick={() => stepDate(1)}
                style={{
                  background: '#141414', border: '1px solid rgba(255,255,255,0.12)',
                  borderRadius: 4, width: 40, height: 44,
                  color: '#fff', fontSize: 18, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                }}
              >›</button>
            </div>
          </div>
          <div style={{ marginTop: 20 }}>
            <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 28, letterSpacing: '0.04em', color: '#fff' }}>
              {formatDateLabel(date)}
            </div>
          </div>
        </div>

        {/* Legend (desktop) */}
        {!isMobile && (
        <div style={{ display: 'flex', gap: 24, marginBottom: 24, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 16, height: 16, borderRadius: 3, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)' }} />
            <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>AVAILABLE — click to book</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 16, height: 16, borderRadius: 3, background: 'rgba(255,80,80,0.15)', border: '1px solid rgba(255,80,80,0.2)' }} />
            <span style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em' }}>BOOKED</span>
          </div>
        </div>
        )}

        {/* Full Warehouse Banner */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 20,
          background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 6, padding: '20px 28px', marginBottom: 32,
        }}>
          <div>
            <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 20, letterSpacing: '0.05em', color: '#fff', marginBottom: 4 }}>
              NEED THE WHOLE SPACE?
            </div>
            <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.5)', maxWidth: 480 }}>
              Book a full studio buyout for private productions and large crews of up to 30 people. All sets, all equipment, complete creative control.
            </div>
          </div>
          <Link href="/book?type=studio" style={{
            fontFamily: 'Inter', fontSize: 11, fontWeight: 600, letterSpacing: '0.15em',
            color: '#000', background: '#fff', padding: '12px 24px',
            borderRadius: 2, textDecoration: 'none', whiteSpace: 'nowrap', flexShrink: 0,
          }}>
            BOOK FULL WAREHOUSE ↗
          </Link>
        </div>

        {/* ── Mobile view: overview heatmap + set picker + time list ───────── */}
        {isMobile && (
          <div style={{ marginBottom: 8 }}>

            {/* Overview heatmap */}
            <div style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, letterSpacing: '0.18em', color: '#fff', marginBottom: 10 }}>
              STUDIO OVERVIEW
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: `28px repeat(${SETS.length}, 1fr)`, gap: 2, marginBottom: 10 }}>
              <div />
              {SETS.map(s => (
                <div key={s.slug} style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'center', paddingBottom: 4 }}>
                  <span style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)', whiteSpace: 'nowrap', fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 9, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.45)' }}>
                    {CODES[s.slug]}
                  </span>
                </div>
              ))}
              {HOURS.map(h => (
                <Fragment key={h}>
                  <div style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 8, color: 'rgba(255,255,255,0.35)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', paddingRight: 4 }}>
                    {fmt12(h)}
                  </div>
                  {SETS.map(s => {
                    const booked = isBooked(s.slug, h) || isBooked(s.slug, h + 0.5)
                    return (
                      <div key={s.slug} style={{
                        aspectRatio: '1', borderRadius: 2,
                        background: booked ? 'rgba(255,80,80,0.20)' : 'rgba(255,255,255,0.05)',
                        border: booked ? '1px solid rgba(255,80,80,0.28)' : '1px solid rgba(255,255,255,0.07)',
                      }} />
                    )
                  })}
                </Fragment>
              ))}
            </div>

            {/* Heatmap legend */}
            <div style={{ display: 'flex', gap: 18, marginBottom: 32, fontFamily: 'Inter, sans-serif', fontSize: 11, color: 'rgba(255,255,255,0.45)' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 11, height: 11, borderRadius: 2, background: 'rgba(255,80,80,0.20)', border: '1px solid rgba(255,80,80,0.28)' }} /> Booked
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ width: 11, height: 11, borderRadius: 2, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)' }} /> Open
              </span>
            </div>

            {/* Set picker */}
            <div style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, letterSpacing: '0.18em', color: '#fff', marginBottom: 12 }}>
              BOOK A SET
            </div>
            <div style={{ display: 'flex', gap: 8, overflowX: 'auto', paddingBottom: 6, marginBottom: 20, WebkitOverflowScrolling: 'touch' }}>
              {SETS.map(s => {
                const sel = mobileSet === s.slug
                return (
                  <button key={s.slug} onClick={() => setMobileSet(s.slug)} style={{
                    flexShrink: 0, cursor: 'pointer',
                    background: sel ? '#fff' : 'transparent',
                    color: sel ? '#080808' : 'rgba(255,255,255,0.65)',
                    border: sel ? '1px solid #fff' : '1px solid rgba(255,255,255,0.2)',
                    padding: '9px 15px', borderRadius: 2,
                    fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 11, letterSpacing: '0.08em', whiteSpace: 'nowrap',
                  }}>
                    {s.name.toUpperCase()}
                  </button>
                )
              })}
            </div>

            {/* Time list for selected set */}
            {loading ? (
              <div style={{ fontFamily: 'Inter, sans-serif', fontSize: 13, color: 'rgba(255,255,255,0.4)', padding: '24px 0' }}>Loading…</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {SLOTS.map(slot => {
                  const booked = isBooked(mobileSet, slot)
                  return (
                    <button key={slot} onClick={() => handleCell(mobileSet, slot)} disabled={booked} style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', boxSizing: 'border-box',
                      padding: '15px 18px', textAlign: 'left',
                      background: booked ? '#121212' : 'transparent',
                      border: booked ? '1px solid rgba(255,255,255,0.06)' : '1px solid rgba(255,255,255,0.16)',
                      borderRadius: 3, cursor: booked ? 'default' : 'pointer', opacity: booked ? 0.55 : 1,
                    }}>
                      <span style={{ fontFamily: '"Inter Tight", Inter, sans-serif', fontSize: 15, color: '#fff' }}>{fmtFull(slot)}</span>
                      <span style={{ fontFamily: '"JetBrains Mono", ui-monospace, monospace', fontSize: 10, letterSpacing: '0.12em', color: booked ? 'rgba(255,120,120,0.7)' : '#5dca8f' }}>
                        {booked ? 'BOOKED' : 'AVAILABLE'}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* Grid (desktop) */}
        {!isMobile && (
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ minWidth: 900 }}>

            {/* Column headers */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '72px repeat(10, 1fr)',
              gap: 4,
              marginBottom: 4,
            }}>
              <div /> {/* time label column */}
              {SETS.map(set => (
                <div key={set.slug} style={{
                  fontFamily: 'Inter', fontSize: 10, fontWeight: 600,
                  letterSpacing: '0.1em', color: 'rgba(255,255,255,0.5)',
                  textAlign: 'center', padding: '0 4px 8px',
                }}>
                  <div>{set.name.toUpperCase()}</div>
                  <div style={{ color: 'rgba(255,255,255,0.25)', fontWeight: 400, marginTop: 2 }}>${set.price}/hr</div>
                </div>
              ))}
            </div>

            {/* Time rows — 30-min slots */}
            {loading ? (
              <div style={{ textAlign: 'center', padding: '60px 0', fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
                Loading availability...
              </div>
            ) : (
              SLOTS.map(slot => {
                const isHalf = slot % 1 !== 0
                return (
                  <div key={slot} style={{
                    display: 'grid',
                    gridTemplateColumns: '72px repeat(10, 1fr)',
                    gap: 3,
                    marginBottom: 2,
                  }}>
                    {/* Time label — whole hours bold, :30 dim */}
                    <div style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                      paddingRight: 10,
                      fontFamily: 'Inter',
                      fontSize: isHalf ? 9 : 11,
                      color: isHalf ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.35)',
                      fontWeight: isHalf ? 400 : 500,
                      letterSpacing: '0.05em',
                    }}>
                      {fmt12(slot)}
                    </div>

                    {/* Set cells */}
                    {SETS.map(set => {
                      const booked = isBooked(set.slug, slot)
                      return (
                        <button
                          key={set.slug}
                          onClick={() => handleCell(set.slug, slot)}
                          disabled={booked}
                          title={booked ? 'Already booked' : `Book ${set.name} at ${fmt12(slot)}`}
                          style={{
                            ...cellBase,
                            background: booked
                              ? 'rgba(255,60,60,0.08)'
                              : 'rgba(255,255,255,0.05)',
                            border: booked
                              ? '1px solid rgba(255,60,60,0.15)'
                              : `1px solid rgba(255,255,255,${isHalf ? '0.05' : '0.08'})`,
                            color: booked
                              ? 'rgba(255,80,80,0.4)'
                              : 'rgba(255,255,255,0.0)',
                            cursor: booked ? 'default' : 'pointer',
                          }}
                          onMouseEnter={e => {
                            if (!booked) {
                              ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.12)'
                              ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.3)'
                              ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.8)'
                            }
                          }}
                          onMouseLeave={e => {
                            if (!booked) {
                              ;(e.currentTarget as HTMLButtonElement).style.background = 'rgba(255,255,255,0.05)'
                              ;(e.currentTarget as HTMLButtonElement).style.borderColor = `rgba(255,255,255,${isHalf ? '0.05' : '0.08'})`
                              ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.0)'
                            }
                          }}
                        >
                          {booked ? '✕' : ''}
                        </button>
                      )
                    })}
                  </div>
                )
              })
            )}

          </div>
        </div>
        )}

        {/* Footer note */}
        <p style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.25)', marginTop: 40 }}>
          All bookings must be made at least 48 hours in advance. Studio hours: 9AM – 10PM daily.
        </p>
      </div>
    </div>
  )
}
