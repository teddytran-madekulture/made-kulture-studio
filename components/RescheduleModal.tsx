'use client'
// Reduced time picker for moving an existing booking.
//
// Deliberately NOT the grid from app/book/BookClient.tsx. That grid solves a
// harder problem — pick a set, pick a start, pick an end, stack a cart — and it
// is the most exercised page on the site. Rescheduling is one set, one date and
// a fixed length, so it only needs start times. Reusing the big grid would mean
// refactoring checkout to serve a case it was never shaped for.

import { useCallback, useEffect, useState } from 'react'

const OPEN_HOUR  = 9
const CLOSE_HOUR = 22
const ADVANCE_DAYS = 2

export interface ReschedulableBooking {
  id: string
  start_time: string
  end_time: string
  setName: string
  setSlug: string | null
}

function fmt12(h: number): string {
  const hr = Math.floor(h), mn = h % 1 ? '30' : '00'
  return `${hr % 12 === 0 ? 12 : hr % 12}:${mn}${hr >= 12 ? 'PM' : 'AM'}`
}

// Houston-local date + decimal hour. ⚠️ Derived through Intl, never by slicing —
// stored timestamps come back in UTC, so an 11PM booking reads as the next day.
function centralParts(iso: string) {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(d)
  const p = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(d)
  const h = Number(p.find(x => x.type === 'hour')?.value ?? 0)
  const m = Number(p.find(x => x.type === 'minute')?.value ?? 0)
  return { date, hour: (h === 24 ? 0 : h) + m / 60 }
}

function todayCentral(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
}
function plusDays(n: number): string {
  const [y, m, d] = todayCentral().split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

export default function RescheduleModal({
  booking, isPlus, onClose, onDone,
}: {
  booking: ReschedulableBooking
  isPlus: boolean
  onClose: () => void
  onDone: (msg: string) => void
}) {
  const cur = centralParts(booking.start_time)
  const durationHours =
    (Date.parse(booking.end_time) - Date.parse(booking.start_time)) / 3_600_000

  const [date, setDate]       = useState(cur.date)
  const [booked, setBooked]   = useState<{ start: number; end: number }[]>([])
  const [blocks, setBlocks]   = useState<{ start: number; end: number }[]>([])
  const [loading, setLoading] = useState(true)
  const [picked, setPicked]   = useState<number | null>(null)
  const [busy, setBusy]       = useState(false)
  const [err, setErr]         = useState('')

  // Inside the advance window this move is Plus-only AND has to land in an hour
  // the studio is already open for — the same containment rule as booking.
  const inWindow = date < plusDays(ADVANCE_DAYS)

  const load = useCallback(async () => {
    if (!booking.setSlug) { setLoading(false); return }
    setLoading(true); setPicked(null)
    try {
      const av = await fetch(`/api/availability?set_id=${booking.setSlug}&date=${date}`, { cache: 'no-store' })
        .then(r => r.json()).catch(() => ({}))
      // ⚠️ Availability includes THIS booking. On its own date it would render
      // its current slot as taken and the member could not see where they are.
      const mine = centralParts(booking.start_time)
      const myEnd = centralParts(booking.end_time).hour
      setBooked(((av?.booked ?? []) as any[]).filter(b =>
        !(date === mine.date && b.start === mine.hour && b.end === myEnd)))

      if (inWindow && isPlus) {
        const ob = await fetch(`/api/plus/open-blocks?date=${date}&exclude=${booking.id}`, { cache: 'no-store' })
          .then(r => r.json()).catch(() => ({}))
        const entry = (ob?.sets ?? {})[String(booking.setSlug)]
        setBlocks(((entry as any)?.blocks ?? []).map((b: any) => ({ start: b.startHour, end: b.endHour })))
      } else {
        setBlocks([])
      }
    } finally {
      setLoading(false)
    }
  }, [booking.id, booking.setSlug, booking.start_time, booking.end_time, date, inWindow, isPlus])

  useEffect(() => { load() }, [load])

  const nowParts = centralParts(new Date().toISOString())
  const isToday  = date === nowParts.date

  // Whole-hour starts only, and the whole session has to finish before closing.
  const starts: number[] = []
  for (let h = OPEN_HOUR; h + durationHours <= CLOSE_HOUR; h++) starts.push(h)

  const stateOf = (h: number): 'ok' | 'taken' | 'past' | 'closed' => {
    const end = h + durationHours
    if (isToday && h <= nowParts.hour + 2) return 'past'   // 2-hour lead, same as the server
    if (booked.some(b => b.start < end && b.end > h)) return 'taken'
    if (inWindow && !blocks.some(b => h >= b.start && end <= b.end)) return 'closed'
    return 'ok'
  }

  const submit = async () => {
    if (picked == null) return
    setBusy(true); setErr('')
    try {
      const res = await fetch(`/api/account/bookings/${booking.id}/reschedule`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ date, startHour: picked }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErr(d.error || 'Could not move that booking.'); setBusy(false); return }
      onDone(`Moved to ${d.when}.${d.doorCode ? ' Your new door code is on its way by text.' : ''}`)
    } catch {
      setErr('Something went wrong — nothing was changed.')
      setBusy(false)
    }
  }

  const overlay: React.CSSProperties = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.75)', zIndex: 100,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20,
  }
  const box: React.CSSProperties = {
    background: '#0f0f0f', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 10,
    padding: 24, width: '100%', maxWidth: 520, maxHeight: '90vh', overflowY: 'auto',
  }

  return (
    <div style={overlay} onClick={onClose}>
      <div style={box} onClick={e => e.stopPropagation()}>
        <div style={{ fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.16em', color: 'rgba(255,255,255,0.35)', marginBottom: 8 }}>
          MOVE THIS SESSION
        </div>
        <div style={{ fontFamily: 'Anton, "Bebas Neue", sans-serif', fontSize: 24, marginBottom: 4 }}>
          {booking.setName}
        </div>
        <div style={{ fontFamily: 'Inter', fontSize: 13, color: 'rgba(255,255,255,0.45)', marginBottom: 18, lineHeight: 1.5 }}>
          Currently {fmt12(cur.hour)}–{fmt12(cur.hour + durationHours)} on {cur.date}.<br />
          Same set, same {durationHours} hour{durationHours === 1 ? '' : 's'}, same price — only the time changes.
        </div>

        <label style={{ display: 'block', fontFamily: 'Inter', fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
          NEW DATE
        </label>
        <input type="date" value={date} min={isPlus ? todayCentral() : plusDays(ADVANCE_DAYS)}
          onChange={e => setDate(e.target.value)}
          style={{ width: '100%', background: '#0d0d0d', border: '1px solid rgba(255,255,255,0.15)', color: '#fff', colorScheme: 'dark', padding: '12px', fontFamily: 'Inter', fontSize: 14, boxSizing: 'border-box', marginBottom: 18 }} />

        {inWindow && (
          <div style={{ border: '1px solid rgba(201,178,126,0.35)', background: 'rgba(201,178,126,0.06)', padding: '10px 14px', marginBottom: 16, fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.55 }}>
            {isPlus
              ? 'Short notice — as a Plus member you can move into hours the studio is already open. Anything else, text us and we’ll sort it out.'
              : 'That’s inside 48 hours. Text (832) 408-1631 and we’ll move it for you.'}
          </div>
        )}

        <label style={{ display: 'block', fontFamily: 'Inter', fontSize: 10, fontWeight: 600, letterSpacing: '0.14em', color: 'rgba(255,255,255,0.4)', marginBottom: 8 }}>
          NEW START TIME
        </label>
        {loading ? (
          <div style={{ fontFamily: 'Inter', fontSize: 12, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.1em', padding: '12px 0' }}>CHECKING AVAILABILITY…</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(80px, 1fr))', gap: 1, background: 'rgba(255,255,255,0.06)', marginBottom: 18 }}>
            {starts.map(h => {
              const st = stateOf(h)
              const on = picked === h
              return (
                <button key={h} disabled={st !== 'ok'} onClick={() => setPicked(h)}
                  title={st === 'taken' ? 'Already booked' : st === 'past' ? 'Too soon' : st === 'closed' ? 'Studio isn’t open then' : undefined}
                  style={{
                    background: on ? '#fff' : '#0d0d0d', border: 'none', padding: '14px 6px',
                    color: on ? '#080808' : st === 'ok' ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.16)',
                    cursor: st === 'ok' ? 'pointer' : 'not-allowed',
                    fontFamily: 'Inter', fontSize: 12, fontWeight: on ? 600 : 400,
                  }}>
                  {fmt12(h)}
                </button>
              )
            })}
          </div>
        )}

        {picked != null && (
          <div style={{ fontFamily: 'Inter', fontSize: 13, color: '#c9b27e', marginBottom: 14 }}>
            New time: {fmt12(picked)} – {fmt12(picked + durationHours)}
          </div>
        )}
        {err && <div style={{ fontFamily: 'Inter', fontSize: 12, color: '#f87171', marginBottom: 12, lineHeight: 1.5 }}>{err}</div>}

        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button onClick={submit} disabled={picked == null || busy}
            style={{ background: picked == null || busy ? 'rgba(255,255,255,0.2)' : '#fff', border: 'none', color: picked == null || busy ? 'rgba(255,255,255,0.5)' : '#080808', padding: '12px 20px', cursor: picked == null || busy ? 'not-allowed' : 'pointer', fontFamily: 'Inter', fontSize: 11, fontWeight: 600, letterSpacing: '0.12em' }}>
            {busy ? 'MOVING…' : 'CONFIRM NEW TIME'}
          </button>
          <button onClick={onClose} disabled={busy}
            style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.6)', padding: '12px 20px', cursor: 'pointer', fontFamily: 'Inter', fontSize: 11, letterSpacing: '0.12em' }}>
            KEEP CURRENT TIME
          </button>
        </div>

        <div style={{ fontFamily: 'Inter', fontSize: 11, color: 'rgba(255,255,255,0.3)', marginTop: 14, lineHeight: 1.5 }}>
          Your door code changes when the session moves — we’ll text you the new one. The old code stops working.
        </div>
      </div>
    </div>
  )
}
