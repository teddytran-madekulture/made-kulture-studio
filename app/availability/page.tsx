'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

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
  { slug: 'studio-one',    name: 'Studio One',        price: 65  },
]

// 9AM–9PM start slots (studio closes 10PM so last bookable start = 9PM)
const HOURS = Array.from({ length: 13 }, (_, i) => i + 9)

function fmt12(h: number) {
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12  = h % 12 === 0 ? 12 : h % 12
  return `${h12}${ampm}`
}

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
  const min     = minDate()
  const [date, setDate]     = useState(min)
  const [sets, setSets]     = useState<Record<string, SetData>>({})
  const [loading, setLoading] = useState(true)
  const [menuOpen, setMenuOpen] = useState(false)

  useEffect(() => {
    setLoading(true)
    fetch(`/api/availability?date=${date}`)
      .then(r => r.json())
      .then(d => { setSets(d.sets ?? {}); setLoading(false) })
      .catch(() => setLoading(false))
  }, [date])

  const isBooked = (slug: string, hour: number) => {
    const setData = sets[slug]
    if (!setData) return false
    return setData.bookedSlots.some(b => hour >= b.start && hour < b.end)
  }

  const handleCell = (slug: string, hour: number) => {
    if (isBooked(slug, hour)) return
    router.push(`/book?type=set&set=${slug}&date=${date}&start=${hour}`)
  }

  // ── Styles ─────────────────────────────────────────────────────────────────

  const cellBase: React.CSSProperties = {
    height: 44,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
    fontSize: 11,
    fontWeight: 600,
    letterSpacing: '0.05em',
    transition: 'all 0.15s',
    userSelect: 'none',
  }

  return (
    <div style={{ background: '#080808', minHeight: '100vh', color: '#fff' }}>

      {/* NAV */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '24px 40px',
        background: 'linear-gradient(to bottom, rgba(8,8,8,0.98) 0%, transparent 100%)',
      }}>
        <Link href="/" style={{ textDecoration: 'none' }}>
          <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 22, letterSpacing: '0.05em', color: '#fff', lineHeight: 1 }}>
            MADE<br />KULTURE
          </div>
        </Link>
        <div style={{ display: 'flex', gap: 40, alignItems: 'center' }}>
          {[['HOME', '/'], ['SETS', '/sets'], ['STUDIO RULES', '/studio-rules'], ['AVAILABILITY', '/availability'], ['BOOK', '/book']].map(([label, href]) => (
            <Link key={label} href={href}
              style={{
                fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em',
                color: label === 'AVAILABILITY' ? '#fff' : 'rgba(255,255,255,0.7)',
                textDecoration: 'none',
              }}
            >{label}</Link>
          ))}
          <Link href="/book" style={{
            fontFamily: 'Inter', fontSize: 11, fontWeight: 600, letterSpacing: '0.15em',
            color: '#000', background: '#fff', padding: '10px 20px', borderRadius: 2, textDecoration: 'none',
          }}>BOOK NOW ↗</Link>
        </div>
      </nav>

      {/* PAGE */}
      <div style={{ paddingTop: 120, paddingBottom: 80, paddingLeft: 40, paddingRight: 40, maxWidth: 1400, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ marginBottom: 48 }}>
          <div style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.2em', color: 'rgba(255,255,255,0.4)', marginBottom: 12 }}>
            STUDIO AVAILABILITY
          </div>
          <h1 style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 56, letterSpacing: '0.02em', margin: 0, lineHeight: 1 }}>
            CHECK WHAT'S OPEN
          </h1>
          <p style={{ fontFamily: 'Inter', fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 16, maxWidth: 500 }}>
            Pick a date to see real-time availability across all 9 sets. Click any open slot to book it instantly.
          </p>
        </div>

        {/* Date picker */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 24, marginBottom: 40, flexWrap: 'wrap' }}>
          <div>
            <label style={{ fontFamily: 'Inter', fontSize: 11, fontWeight: 500, letterSpacing: '0.15em', color: 'rgba(255,255,255,0.4)', display: 'block', marginBottom: 8 }}>
              SELECT DATE
            </label>
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
          </div>
          <div style={{ marginTop: 20 }}>
            <div style={{ fontFamily: 'Bebas Neue, sans-serif', fontSize: 28, letterSpacing: '0.04em', color: '#fff' }}>
              {formatDateLabel(date)}
            </div>
          </div>
        </div>

        {/* Legend */}
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

        {/* Grid */}
        <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
          <div style={{ minWidth: 900 }}>

            {/* Column headers */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '72px repeat(9, 1fr)',
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

            {/* Hour rows */}
            {loading ? (
              <div style={{ textAlign: 'center', padding: '60px 0', fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
                Loading availability...
              </div>
            ) : (
              HOURS.map(hour => (
                <div key={hour} style={{
                  display: 'grid',
                  gridTemplateColumns: '72px repeat(9, 1fr)',
                  gap: 4,
                  marginBottom: 4,
                }}>
                  {/* Time label */}
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                    paddingRight: 12,
                    fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.35)',
                    fontWeight: 500, letterSpacing: '0.05em',
                  }}>
                    {fmt12(hour)}
                  </div>

                  {/* Set cells */}
                  {SETS.map(set => {
                    const booked = isBooked(set.slug, hour)
                    return (
                      <button
                        key={set.slug}
                        onClick={() => handleCell(set.slug, hour)}
                        disabled={booked}
                        title={booked ? 'Already booked' : `Book ${set.name} at ${fmt12(hour)}`}
                        style={{
                          ...cellBase,
                          background: booked
                            ? 'rgba(255,60,60,0.08)'
                            : 'rgba(255,255,255,0.05)',
                          border: booked
                            ? '1px solid rgba(255,60,60,0.15)'
                            : '1px solid rgba(255,255,255,0.08)',
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
                            ;(e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(255,255,255,0.08)'
                            ;(e.currentTarget as HTMLButtonElement).style.color = 'rgba(255,255,255,0.0)'
                          }
                        }}
                      >
                        {booked ? '✕' : 'BOOK'}
                      </button>
                    )
                  })}
                </div>
              ))
            )}

          </div>
        </div>

        {/* Footer note */}
        <p style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.25)', marginTop: 40 }}>
          All bookings must be made at least 48 hours in advance. Studio hours: 9AM – 10PM daily.
        </p>
      </div>
    </div>
  )
}
