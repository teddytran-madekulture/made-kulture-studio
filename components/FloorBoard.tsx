"use client"

// ATLAS — Availability, Turnover, Layout & Alert System.
// The live board of every tracked room in the building, by colour.
// (File is still FloorBoard.tsx; ATLAS is the name the studio uses for it.)
//
// Drawn from the real building plan (Building Plans/Set Layou.jpg), stripped to
// rooms only: no streets, parking, ramp, stairs or door swings. Geometry is in a
// 910x890 viewBox and scales to whatever screen it lands on.
//
// ⚠️ NO GUEST NAMES. This renders on the desk lock screen, which sits where
// anyone can see it. The board says a room is busy and when it frees up; who is
// in it is a question for someone who has unlocked the tablet.

import { useCallback, useEffect, useRef, useState } from 'react'

const READY = '#43c97f'
const INUSE = '#c9b27e'
const DIRTY = '#ff5c5c'
const LINE: Record<string, string> = { ready: READY, inuse: INUSE, dirty: DIRTY }
const FILL: Record<string, string> = {
  ready: 'rgba(67,201,127,.16)', inuse: 'rgba(201,178,126,.18)', dirty: 'rgba(255,92,92,.17)',
}
const WORD: Record<string, string> = { ready: 'READY', inuse: 'IN USE', dirty: 'NEEDS CLEANING' }

interface Shape {
  code: string
  x?: number; y?: number; w?: number; h?: number
  poly?: string; cx?: number; cy?: number
  small?: boolean
  /** Too small to letter inside — name and state sit under the box. */
  outside?: boolean
}

// Traced from the plan. The Tank is 4x6 ft against the rooms' 12x16, so at this
// scale (~8.8 px per foot) it is ~53x36 and cannot hold a label.
const SHAPES: Shape[] = [
  { code: 'set-a',         x: 20,  y: 20,  w: 130, h: 120 },
  { code: 'set-b',         x: 167, y: 20,  w: 128, h: 120 },
  { code: 'set-c',         x: 313, y: 20,  w: 127, h: 120 },
  { code: 'set-d',         x: 458, y: 20,  w: 127, h: 120 },
  { code: 'watering-hole', x: 682, y: 40,  w: 118, h: 100, small: true },
  { code: 'vintage',       x: 94,  y: 265, w: 106, h: 142 },
  { code: 'cottage',       x: 212, y: 265, w: 110, h: 142 },
  { code: 'concrete',      x: 422, y: 269, w: 118, h: 88,  small: true },
  { code: 'the-tank',      x: 640, y: 355, w: 53,  h: 36,  outside: true },
  { code: 'restroom-1',    x: 812, y: 455, w: 80,  h: 56,  small: true },
  { code: 'restroom-2',    x: 812, y: 517, w: 80,  h: 56,  small: true },
  { code: 'vanity',        x: 145, y: 470, w: 152, h: 85,  small: true },
  { code: 'studio-one',    poly: '437,452 605,452 875,690 875,868 437,868', cx: 640, cy: 700 },
]

export interface Area {
  code: string; label: string; kind: 'set' | 'facility'
  state: 'ready' | 'inuse' | 'dirty'
  untilISO: string | null; startsISO: string | null; dirtySinceISO: string | null
  clearedAt: string | null; clearedBy: string | null
  guestName: string | null; guestPhone: string | null; viaBuyout: boolean; alsoDirty: boolean
  dirtyFromBuyout: boolean
}

// Fit a room name inside its box. "THE WATERING HOLE" ran clean out of a 118px
// room at 12px — so wrap on spaces first (two lines max), and only shrink the
// type if wrapping still is not enough. Shrinking first would make the longest
// names the least readable, which is backwards on a board read across a room.
//
// 0.62 is an em-width estimate for bold Inter with the letter-spacing used here.
// SVG has no text metrics without measuring, and measuring every label on every
// poll costs more than it is worth.
// `track` is the letter-spacing in em — it is NOT decoration, it is width. At
// .16em a 14-character word is a quarter wider than the glyphs alone, which is
// exactly why "NEEDS CLEANING" burst out of the narrow rooms when the estimate
// ignored it.
function fitLabel(label: string, maxW: number, startSize: number, track = 0.06): { lines: string[]; size: number } {
  const widthOf = (t: string, f: number) => t.length * f * (0.62 + track)
  for (let size = startSize; size >= 8; size -= 1) {
    const lines: string[] = []
    let cur = ''
    for (const word of label.split(' ')) {
      const test = cur ? cur + ' ' + word : word
      if (!cur || widthOf(test, size) <= maxW) cur = test
      else { lines.push(cur); cur = word }
    }
    if (cur) lines.push(cur)
    if (lines.length <= 2 && lines.every(l => widthOf(l, size) <= maxW)) return { lines, size }
  }
  return { lines: [label], size: 8 }
}

const clock = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' })
    .format(new Date(iso))

export interface AgendaRow {
  id: string; setLabel: string; startISO: string; endISO: string
  guestName: string | null; guestPhone: string | null; buyout: boolean
}

export default function FloorBoard({
  actionable = false,
  onRoomTap,
  openCode,
}: {
  actionable?: boolean
  /** When set, a room tap is handed upward instead of opening the panel — the
   *  lock screen uses this to ask for the PIN first. */
  onRoomTap?: (a: Area) => void
  /** Open this room's panel on arrival (how the lock screen hands off). */
  openCode?: string | null
}) {
  const [areas, setAreas] = useState<Area[] | null>(null)
  const [agenda, setAgenda] = useState<AgendaRow[]>([])
  const [err, setErr] = useState('')
  // The now-line has to move on its own, or it is a picture of when the page
  // loaded. A minute is plenty — this drives one horizontal rule.
  const [nowMs, setNowMs] = useState(() => Date.now())
  // ⚠️ A RING IS NOT ROOM STATUS — it is somebody standing at a tablet waiting.
  // It gets its own poll because 60s is far too slow for that, and its own tiny
  // endpoint so the extra requests stay cheap.
  const [ring, setRing] = useState<{ ringing: boolean; place: string; waitedSec: number; goneQuiet: boolean } | null>(null)
  const [ringBusy, setRingBusy] = useState(false)
  const [bulkBusy, setBulkBusy] = useState(false)
  // Agenda is the default; the day column is a click away.
  const [view, setView] = useState<'agenda' | 'day'>('agenda')
  // Days from today. ⚠️ Only the CALENDAR travels — the map stays on now.
  const [dayOffset, setDayOffset] = useState(0)
  const [viewer, setViewer] = useState<{ name: string } | null>(null)
  // Manual override. Occupancy stays derived — forcing IN USE would be the board
  // telling you someone is in a room the schedule says is empty — but "this needs
  // cleaning" and "this is clean" are human facts, so a human can set them.
  const [picked, setPicked] = useState<Area | null>(null)
  const [busy, setBusy] = useState(false)
  const [panelErr, setPanelErr] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/floor/board?date=${shiftDate(centralToday(), dayOffset)}`, { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || 'Could not read the floor.'); return }
      setAreas(d.areas ?? []); setAgenda(d.agenda ?? []); setViewer(d.viewer ?? null); setErr('')
    } catch {
      // Keep showing the last known state rather than blanking the wall.
      setErr('Offline — showing the last known state.')
    }
  }, [dayOffset])

  // ⚠️ POLLING IS THE #1 COST IN THIS PROJECT — a 5s jukebox poll once ate 78%
  // of all Vercel compute. Room status changes a handful of times a day, so this
  // is 60s, and it stops entirely while the tab is hidden.
  useEffect(() => {
    load()
    let iv: ReturnType<typeof setInterval> | null = null
    const start = () => { if (!iv) iv = setInterval(load, 60_000) }
    const stop  = () => { if (iv) { clearInterval(iv); iv = null } }
    const onVis = () => (document.hidden ? stop() : (load(), start()))
    document.addEventListener('visibilitychange', onVis)
    start()
    return () => { document.removeEventListener('visibilitychange', onVis); stop() }
  }, [load])

  // Arriving from the lock screen with a room in hand: open it once the board
  // has actually loaded, then stop, so a later refresh does not reopen it.
  const openedRef = useRef(false)
  useEffect(() => {
    if (openedRef.current || !openCode || !areas) return
    const a = areas.find(x => x.code === openCode)
    if (a) { openedRef.current = true; setPicked(a) }
  }, [openCode, areas])

  useEffect(() => {
    const iv = setInterval(() => setNowMs(Date.now()), 60_000)
    return () => clearInterval(iv)
  }, [])

  // 20s: a guest waiting notices a minute, so 60 would be useless — but this is
  // one tablet reading three rows, not the 5s jukebox poll that once ate 78% of
  // all Vercel compute. Stops entirely while the tab is hidden.
  useEffect(() => {
    const pull = async () => {
      try {
        const r = await fetch('/api/admin/kiosk-ack', { cache: 'no-store' })
        if (r.ok) setRing(await r.json())
      } catch { /* leave the last known state up */ }
    }
    pull()
    let iv: ReturnType<typeof setInterval> | null = null
    const start = () => { if (!iv) iv = setInterval(pull, 20_000) }
    const stop = () => { if (iv) { clearInterval(iv); iv = null } }
    const onVis = () => (document.hidden ? stop() : (pull(), start()))
    document.addEventListener('visibilitychange', onVis)
    start()
    return () => { document.removeEventListener('visibilitychange', onVis); stop() }
  }, [])

  const onMyWay = async () => {
    if (ringBusy) return
    setRingBusy(true)
    try {
      const r = await fetch('/api/admin/kiosk-ack', { method: 'POST' })
      if (r.ok) setRing(rg => (rg ? { ...rg, ringing: false } : rg))
    } catch { /* the banner stays up, which is the honest outcome */ }
    setRingBusy(false)
  }
  const ringingPlace = ring?.ringing ? ring.place : ''

  const byCode = new Map((areas ?? []).map(a => [a.code, a]))
  const counts = { inuse: 0, ready: 0, dirty: 0 }
  for (const a of areas ?? []) counts[a.state]++
  // A room can be gold and filthy at once. It belongs in the cleaning count.
  const needsClean = (a: Area) => a.state === 'dirty' || a.alsoDirty
  counts.dirty = (areas ?? []).filter(needsClean).length
  const dirtyList = (areas ?? []).filter(needsClean)
  // A full-studio buyout genuinely holds every room, so the same name was
  // printing on nine of them. One banner says it once and says it better.
  const buyout = (areas ?? []).find(a => a.viaBuyout) ?? null
  // One buyout ends and ten rooms go red. Clearing them one at a time is ten
  // taps for a single event, which is how a board stops getting used.
  const buyoutDirty = (areas ?? []).filter(a => a.dirtyFromBuyout)

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ padding: '18px 28px 6px', display: 'flex', alignItems: 'center', gap: 24, flexShrink: 0 }}>
        <div style={{ fontWeight: 900, letterSpacing: '.3em', fontSize: 18, whiteSpace: 'nowrap' }}>MADE KULTURE</div>
        <div style={{ fontSize: 12, letterSpacing: '.16em', color: 'rgba(201,178,126,.55)', whiteSpace: 'nowrap' }}>
          {err ? err.toUpperCase() : 'ATLAS · LIVE'}
        </div>
        {viewer && (
          <div style={{ fontSize: 12, letterSpacing: '.12em', color: 'rgba(255,255,255,.42)', whiteSpace: 'nowrap' }}>
            {viewer.name.toUpperCase()}
          </div>
        )}
        <div style={{ display: 'flex', gap: 24, marginLeft: 'auto', alignItems: 'baseline' }}>
          {([['inuse', 'IN USE'], ['ready', 'READY'], ['dirty', 'NEED CLEANING']] as const).map(([k, w]) => (
            <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <b style={{ fontSize: 32, fontWeight: 800, color: LINE[k] }}>{counts[k]}</b>
              <span style={{ fontSize: 11, letterSpacing: '.18em', color: 'rgba(255,255,255,.5)' }}>{w}</span>
            </div>
          ))}
        </div>
      </div>

      {ring?.ringing && (
        <div style={{
          margin: '8px 28px 0', padding: '11px 16px', flexShrink: 0,
          border: '2px solid #ff4d4d', background: 'rgba(255,77,77,.12)', borderRadius: 12,
          display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap',
          animation: 'mkRing 1.5s ease-in-out infinite',
        }}>
          <style>{'@keyframes mkRing{0%,100%{opacity:1}50%{opacity:.62}}'}</style>
          <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.24em', color: '#ff6b6b' }}>
            {ring.goneQuiet ? 'STILL WAITING' : 'ASKING FOR HELP'}
          </span>
          <span style={{ fontSize: 19, fontWeight: 800 }}>{ring.place || 'A tablet'}</span>
          <span style={{ fontSize: 13, color: 'rgba(255,255,255,.6)' }}>
            waiting {ring.waitedSec < 60 ? `${ring.waitedSec}s` : `${Math.round(ring.waitedSec / 60)} min`}
          </span>
          {/* ⚠️ Only on the UNLOCKED board. Seeing the ring is free; saying
              someone is coming is a promise, and it costs the PIN. */}
          {actionable ? (
            <button disabled={ringBusy} onClick={onMyWay} style={{
              marginLeft: 'auto', border: 'none', borderRadius: 11, cursor: 'pointer',
              background: 'linear-gradient(135deg,#ff6b6b,#d63d3d)', color: '#fff',
              padding: '12px 26px', fontSize: 12, fontWeight: 800, letterSpacing: '.16em',
              fontFamily: 'Inter, sans-serif', opacity: ringBusy ? 0.5 : 1,
            }}>{ringBusy ? '…' : 'ON MY WAY'}</button>
          ) : (
            <span style={{ marginLeft: 'auto', fontSize: 11, letterSpacing: '.16em', color: 'rgba(255,255,255,.45)' }}>
              UNLOCK TO ANSWER
            </span>
          )}
        </div>
      )}

      {buyout && (
        <div style={{
          margin: '8px 28px 0', padding: '9px 16px', flexShrink: 0,
          border: '1px solid rgba(201,178,126,.42)', background: 'rgba(201,178,126,.09)',
          borderRadius: 12, display: 'flex', alignItems: 'baseline', gap: 12, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.24em', color: INUSE }}>FULL STUDIO</span>
          <span style={{ fontSize: 16, fontWeight: 700 }}>{buyout.guestName ?? 'Whole building booked'}</span>
          <span style={{ fontSize: 12, letterSpacing: '.1em', color: 'rgba(255,255,255,.55)' }}>
            {buyout.state === 'inuse' && buyout.untilISO
              ? `IN THE BUILDING UNTIL ${clock(buyout.untilISO)}`
              : buyout.startsISO ? `ARRIVES ${clock(buyout.startsISO)}` : ''}
          </span>
        </div>
      )}

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 24, padding: '18px 28px 16px' }}>
        <div style={{ flex: '1 1 0', minWidth: 290, maxWidth: 470, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}>
            <button onClick={() => setDayOffset(o => o - 1)} style={dayNavBtn}>‹</button>
            <span style={{
              fontSize: 12, letterSpacing: '.24em', fontWeight: 700, whiteSpace: 'nowrap',
              color: dayOffset === 0 ? 'rgba(201,178,126,.55)' : '#e6d5ab',
            }}>{dayLabel(dayOffset)}</span>
            <button onClick={() => setDayOffset(o => o + 1)} style={dayNavBtn}>›</button>
            {dayOffset !== 0 && (
              <button onClick={() => setDayOffset(0)} style={{ ...dayNavBtn, width: 'auto', padding: '3px 9px', fontSize: 9, letterSpacing: '.12em' }}>
                TODAY
              </button>
            )}
            <span style={{ marginLeft: 'auto', display: 'flex', gap: 4 }}>
              {(['agenda', 'day'] as const).map(v => (
                <button key={v} onClick={() => setView(v)} style={{
                  background: view === v ? 'rgba(201,178,126,.16)' : 'none',
                  border: `1px solid ${view === v ? 'rgba(201,178,126,.45)' : 'rgba(255,255,255,.12)'}`,
                  color: view === v ? '#e6d5ab' : 'rgba(255,255,255,.4)',
                  borderRadius: 8, padding: '5px 12px', fontSize: 11, fontWeight: 800,
                  letterSpacing: '.12em', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                }}>{v.toUpperCase()}</button>
              ))}
            </span>
          </div>
          {/* ⚠️ The now-line is suppressed on any other day — a red "you are
              here" drawn across next Tuesday would be nonsense. */}
          {view === 'day'
            ? <DayColumn agenda={agenda} nowMs={nowMs} showNow={dayOffset === 0} />
            : <AgendaList agenda={agenda} nowMs={nowMs} showNow={dayOffset === 0} />}
        </div>

        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <svg viewBox="0 0 910 890" preserveAspectRatio="xMidYMid meet"
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            <rect x="14" y="10" width="881" height="865" rx="10" fill="none" stroke="rgba(255,255,255,.22)" strokeWidth="3" />
            {/* Back-of-house: drawn for orientation, deliberately NOT tracked.
                Only the vanity corner of it is on the cleaning board. */}
            <rect x="40" y="452" width="362" height="406" rx="9"
              fill="rgba(255,255,255,.022)" stroke="rgba(255,255,255,.11)" strokeWidth="2" strokeDasharray="7 7" />
            <text x="221" y="836" textAnchor="middle"
              style={{ fontSize: 11, letterSpacing: '.2em', fill: 'rgba(255,255,255,.32)', fontWeight: 800 }}>
              STAFF · REGISTER
            </text>

            {SHAPES.map(sh => {
              const a = byCode.get(sh.code)
              const st = a?.state ?? 'ready'
              const cx = sh.poly ? sh.cx! : sh.x! + sh.w! / 2
              const cy = sh.poly ? sh.cy! : sh.y! + sh.h! / 2
              const label = a?.label ?? sh.code.toUpperCase()
              const tap = a && (onRoomTap || actionable)
                ? () => { if (onRoomTap) onRoomTap(a); else { setPicked(a); setPanelErr('') } }
                : undefined
              return (
                <g key={sh.code} onClick={tap} style={{ cursor: tap ? 'pointer' : 'default' }}>
                  {/* ⚠️ Occupied AND never cleaned: the fill stays gold because
                      somebody is in there, but the outline goes red because the
                      room was never reset. Colour alone could only say one. */}
                  {(() => {
                    // A ring outranks every other treatment on the room: somebody
                    // is standing there waiting for a person.
                    const isRinging = !!ringingPlace && a?.label === ringingPlace
                    const stroke = isRinging ? '#ff4d4d' : a?.alsoDirty ? DIRTY : LINE[st]
                    const sw = isRinging ? 4 : a?.alsoDirty ? 3 : 2
                    const common = { fill: isRinging ? 'rgba(255,77,77,.22)' : FILL[st], stroke, strokeWidth: sw,
                                     style: isRinging ? { animation: 'mkRing 1.5s ease-in-out infinite' } : undefined }
                    return sh.poly
                      ? <polygon points={sh.poly} {...common} />
                      : <rect x={sh.x} y={sh.y} width={sh.w} height={sh.h} rx={9} {...common} />
                  })()}
                  {/* ⚠️ A 53x36 target is hard to hit on a wall tablet, especially
                      reaching up. Give the small shapes an invisible pad so you
                      do not have to aim to mark a closet clean. */}
                  {sh.outside && tap && (
                    <rect x={sh.x! - 26} y={sh.y! - 26} width={sh.w! + 52} height={sh.h! + 78} fill="transparent" />
                  )}
                  {(() => {
                    // A label drawn OUTSIDE its box is not boxed in, so it gets
                    // room to breathe; one inside must live within the walls.
                    const maxW = sh.outside ? 130 : sh.w! - 12
                    const fit = fitLabel(label, maxW, sh.outside ? 12 : sh.small ? 12 : 15)
                    // The status word carries .16em tracking and never wraps.
                    const stateFit = fitLabel(WORD[st], maxW, 10, 0.16)
                    const stateSize = stateFit.lines.length > 1 ? 8 : stateFit.size
                    const lh = fit.size * 1.16
                    const showGuest = !!(a?.guestName && !a.viaBuyout) || !!a?.alsoDirty
                    const showTime = !!(!a?.viaBuyout && (a?.startsISO || (a?.state === 'inuse' && a?.untilISO)))
                    // Centre the WHOLE block — name lines, status, and any guest
                    // or time line — not the name alone, or a two-line name and
                    // its extras drift out of the box.
                    const blockH = fit.lines.length * lh + 4 + 11 + (showGuest ? 13 : 0) + (showTime ? 13 : 0)
                    // ⚠️ An outside label goes ABOVE its box, not below. The Tank
                    // sits directly on top of Studio One, so a label underneath
                    // crowds the two together; there is open floor above it.
                    const top = sh.outside ? sh.y! - blockH - 5 : cy - blockH / 2
                    return (
                      <>
                        {fit.lines.map((ln, i) => (
                          <text key={i} x={cx} y={top + lh * (i + 0.5)} textAnchor="middle" dominantBaseline="middle"
                            style={{ fontSize: fit.size, fontWeight: 800, letterSpacing: '.06em', fill: '#fff' }}>{ln}</text>
                        ))}
                        <text x={cx} y={top + fit.lines.length * lh + 4 + 5.5} textAnchor="middle" dominantBaseline="middle"
                          style={{ fontSize: stateSize, fontWeight: 700, letterSpacing: '.16em', fill: LINE[st] }}>{WORD[st]}</text>
                        {a?.alsoDirty && (
                          <text x={cx} y={top + fit.lines.length * lh + 4 + 18} textAnchor="middle" dominantBaseline="middle"
                            style={{ fontSize: 9, fontWeight: 800, letterSpacing: '.12em', fill: DIRTY }}>
                            NOT CLEANED
                          </text>
                        )}
                        {a?.guestName && !a.viaBuyout && !a.alsoDirty && (
                          <text x={cx} y={top + fit.lines.length * lh + 4 + 18} textAnchor="middle" dominantBaseline="middle"
                            style={{ fontSize: 11, fontWeight: 700, fill: 'rgba(255,255,255,.78)' }}>
                            {a.guestName.split(' ')[0]}
                          </text>
                        )}
                        {!a?.viaBuyout && (a?.startsISO || (a?.state === 'inuse' && a?.untilISO)) && (
                          <text x={cx} y={top + fit.lines.length * lh + 4 + (a?.guestName ? 31 : 18)} textAnchor="middle" dominantBaseline="middle"
                            style={{ fontSize: 9, fontWeight: 700, letterSpacing: '.12em', fill: 'rgba(255,255,255,.5)' }}>
                            {a.startsISO ? `BOOKED ${clock(a.startsISO)}` : `UNTIL ${clock(a.untilISO!)}`}
                          </text>
                        )}
                      </>
                    )
                  })()}
                </g>
              )
            })}
          </svg>
        </div>

        <div style={{ width: 250, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ border: '1px solid rgba(201,178,126,.22)', borderRadius: 16, padding: '14px 17px' }}>
            <div style={{ fontSize: 10, letterSpacing: '.3em', color: 'rgba(201,178,126,.55)', fontWeight: 700, marginBottom: 11 }}>LEGEND</div>
            {([[READY, 'Ready & empty'], [INUSE, 'Guests inside'], [DIRTY, 'Needs cleaning']] as const).map(([c, t]) => (
              <div key={t} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9, fontSize: 14 }}>
                <i style={{ width: 15, height: 15, borderRadius: 5, background: c, flexShrink: 0 }} />{t}
              </div>
            ))}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 14 }}>
              <i style={{ width: 15, height: 15, borderRadius: 5, background: INUSE, border: `2px solid ${DIRTY}`, boxSizing: 'border-box', flexShrink: 0 }} />
              In use, not cleaned
            </div>
          </div>

          <div style={{ border: '1px solid rgba(255,92,92,.45)', borderRadius: 16, padding: '14px 17px', background: 'rgba(255,92,92,.06)' }}>
            <div style={{ fontSize: 10, letterSpacing: '.3em', color: '#ff9b9b', fontWeight: 700, marginBottom: 10 }}>NEEDS CLEANING</div>
            {dirtyList.length === 0 ? (
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,.45)' }}>
                {areas ? 'Nothing waiting — whole floor is clear.' : 'Reading the floor…'}
              </div>
            ) : <>
              {actionable && buyoutDirty.length > 1 && (
                <button
                  disabled={bulkBusy}
                  onClick={async () => {
                    setBulkBusy(true)
                    try {
                      const r = await fetch('/api/floor/mark', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ codes: buyoutDirty.map(a => a.code), action: 'clear' }),
                      })
                      if (r.ok) load()
                    } catch { /* the rooms stay red, which is the honest outcome */ }
                    setBulkBusy(false)
                  }}
                  style={{
                    width: '100%', marginBottom: 12, padding: '12px 10px', borderRadius: 11,
                    border: '1px solid rgba(67,201,127,.5)', background: 'rgba(67,201,127,.12)',
                    color: '#8ce9b6', fontFamily: 'Inter, sans-serif', fontSize: 11,
                    fontWeight: 800, letterSpacing: '.1em', cursor: 'pointer', lineHeight: 1.5,
                    opacity: bulkBusy ? 0.5 : 1,
                  }}>
                  {bulkBusy ? '…' : `MARK ALL ${buyoutDirty.length} READY`}
                  <span style={{ display: 'block', fontSize: 10, fontWeight: 400, letterSpacing: '.04em', color: 'rgba(255,255,255,.45)' }}>
                    from the full-studio booking
                  </span>
                </button>
              )}
              {dirtyList.map(a => (
              <div key={a.code} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', fontSize: 15, fontWeight: 600, marginBottom: 7 }}>
                <span>{a.label}</span>
                {/* A set knows WHEN it got dirty — a session ended at a known
                    time. A facility never does, so it shows no clock. */}
                <em style={{ fontStyle: 'normal', fontWeight: 400, fontSize: 12,
                             color: a.alsoDirty ? '#ffb3b3' : 'rgba(255,255,255,.42)', whiteSpace: 'nowrap' }}>
                  {a.alsoDirty ? 'occupied now' : a.dirtySinceISO ? `since ${clock(a.dirtySinceISO)}` : 'flagged by staff'}
                </em>
              </div>
            ))}
            </>}
          </div>
        </div>
      </div>

      {picked && (
        <div
          onClick={() => setPicked(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.72)', display: 'flex',
                   alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}
        >
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#141416', border: '1px solid rgba(201,178,126,.25)', borderRadius: 18,
                     padding: 26, width: '100%', maxWidth: 380, textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '.04em' }}>{picked.label}</div>
            <div style={{ fontSize: 13, letterSpacing: '.16em', color: LINE[picked.state], fontWeight: 700, marginTop: 6 }}>
              {WORD[picked.state]}
            </div>
            {picked.clearedBy && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.38)', marginTop: 8 }}>
                last cleared by {picked.clearedBy}
                {picked.clearedAt ? ` at ${clock(picked.clearedAt)}` : ''}
              </div>
            )}
            {/* ⚠️ Occupancy is NOT overridable. A room is in use because a
                confirmed booking says so; a button that faked it would make the
                board lie about where guests are. */}
            {picked.state === 'inuse' && (
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,.42)', marginTop: 10, lineHeight: 1.6 }}>
                Someone is booked in here{picked.untilISO ? ` until ${clock(picked.untilISO)}` : ''}. That comes
                from the schedule and can’t be set by hand.
              </div>
            )}

            {picked.guestName && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,.09)' }}>
                <div style={{ fontSize: 18, fontWeight: 700 }}>{picked.guestName}</div>
                {picked.guestPhone && (
                  <a
                    href={`/desk?q=${encodeURIComponent(picked.guestPhone)}`}
                    style={{ display: 'inline-block', marginTop: 10, textDecoration: 'none',
                             border: '1px solid rgba(201,178,126,.45)', background: 'rgba(201,178,126,.1)',
                             color: '#e6d5ab', borderRadius: 11, padding: '11px 20px',
                             fontSize: 11, fontWeight: 800, letterSpacing: '.14em' }}
                  >OPEN BOOKING</a>
                )}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              {(['flag', 'clear'] as const).map(act => (
                <button key={act} disabled={busy}
                  onClick={async () => {
                    setBusy(true); setPanelErr('')
                    try {
                      const r = await fetch('/api/floor/mark', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ code: picked.code, action: act }),
                      })
                      const d = await r.json().catch(() => ({}))
                      if (!r.ok) { setPanelErr(d.error || 'That did not go through.') }
                      else { setPicked(null); load() }
                    } catch { setPanelErr('Could not reach the studio system.') }
                    setBusy(false)
                  }}
                  style={{
                    flex: 1, padding: '15px 10px', borderRadius: 12, cursor: 'pointer',
                    fontFamily: 'Inter, sans-serif', fontSize: 12, fontWeight: 800, letterSpacing: '.12em',
                    border: `1px solid ${act === 'flag' ? 'rgba(255,92,92,.5)' : 'rgba(67,201,127,.5)'}`,
                    background: act === 'flag' ? 'rgba(255,92,92,.12)' : 'rgba(67,201,127,.12)',
                    color: act === 'flag' ? '#ff9b9b' : '#8ce9b6', opacity: busy ? 0.5 : 1,
                  }}>
                  {act === 'flag' ? 'NEEDS CLEANING' : 'MARK READY'}
                </button>
              ))}
            </div>
            {panelErr && (
              <div style={{ color: 'rgba(255,255,255,.8)', borderLeft: '2px solid rgba(201,178,126,.55)',
                            paddingLeft: 12, fontSize: 14, marginTop: 16, textAlign: 'left', lineHeight: 1.5 }}>
                {panelErr}
              </div>
            )}
            <button onClick={() => setPicked(null)}
              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,.4)', marginTop: 16,
                       fontFamily: 'Inter, sans-serif', fontSize: 12, letterSpacing: '.16em', cursor: 'pointer' }}>
              CANCEL
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// The line every calendar has: where you are in the day.
function NowLine({ nowMs }: { nowMs: number }) {
  const t = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' })
    .format(new Date(nowMs))
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '4px 0' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ff4d4d', flexShrink: 0 }} />
      <span style={{ flex: 1, height: 2, background: '#ff4d4d', borderRadius: 2 }} />
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.12em', color: '#ff6b6b', whiteSpace: 'nowrap' }}>
        {t}
      </span>
    </div>
  )
}

// Hours-since-midnight CENTRAL. ⚠️ Not local, not UTC — an 11 PM Central booking
// is 04:00 UTC the NEXT day, and positioning it off that would put it at the top
// of tomorrow's column.
function centralHour(iso: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(iso))
  const h = Number(parts.find(p => p.type === 'hour')?.value ?? 0)
  const m = Number(parts.find(p => p.type === 'minute')?.value ?? 0)
  return h + m / 60
}

// A time-scaled day, so the column fills its height by construction and the
// now-line means something positionally rather than just sitting between rows.
function DayColumn({ agenda, nowMs, showNow }: { agenda: AgendaRow[]; nowMs: number; showNow: boolean }) {
  const nowH = centralHour(new Date(nowMs).toISOString())

  // Business hours by default, widened for anything booked outside them.
  let lo = 9, hi = 22
  for (const r of agenda) {
    lo = Math.min(lo, Math.floor(centralHour(r.startISO)))
    hi = Math.max(hi, Math.ceil(centralHour(r.endISO)))
  }
  const span = Math.max(1, hi - lo)
  const pct = (h: number) => ((h - lo) / span) * 100

  // Lane packing so two shoots at the same time sit side by side instead of on
  // top of each other. Sorted by start, each booking takes the first lane free.
  const laneEnds: number[] = []
  const placed = [...agenda]
    .sort((a, b) => Date.parse(a.startISO) - Date.parse(b.startISO))
    .map(r => {
      const s0 = centralHour(r.startISO), e0 = centralHour(r.endISO)
      let lane = laneEnds.findIndex(end => end <= s0)
      if (lane === -1) { lane = laneEnds.length; laneEnds.push(e0) } else { laneEnds[lane] = e0 }
      return { r, s0, e0, lane }
    })
  const lanes = Math.max(1, laneEnds.length)

  const hours: number[] = []
  for (let h = lo; h <= hi; h++) hours.push(h)
  const hourLabel = (h: number) => {
    const hr = h % 24
    const ampm = hr >= 12 ? 'p' : 'a'
    const disp = hr % 12 === 0 ? 12 : hr % 12
    return `${disp}${ampm}`
  }

  return (
    <div style={{ flex: 1, minHeight: 0, position: 'relative', paddingLeft: 34 }}>
      {hours.map(h => (
        <div key={h} style={{ position: 'absolute', left: 0, right: 0, top: `${pct(h)}%` }}>
          <div style={{ position: 'absolute', left: 0, top: -7, fontSize: 11, letterSpacing: '.06em', color: 'rgba(255,255,255,.3)' }}>
            {hourLabel(h)}
          </div>
          <div style={{ marginLeft: 30, height: 1, background: 'rgba(255,255,255,.06)' }} />
        </div>
      ))}

      {placed.map(({ r, s0, e0, lane }) => {
        const over = Date.parse(r.endISO) <= nowMs
        const w = 100 / lanes
        return (
          <div key={r.id} style={{
            position: 'absolute', top: `${pct(s0)}%`, height: `${((e0 - s0) / span) * 100}%`,
            left: `calc(${lane * w}% + 30px)`, width: `calc(${w}% - 34px)`,
            borderRadius: 8, padding: '6px 9px', overflow: 'hidden', boxSizing: 'border-box',
            border: `1px solid ${r.buyout ? 'rgba(201,178,126,.5)' : 'rgba(255,255,255,.16)'}`,
            background: r.buyout ? 'rgba(201,178,126,.13)' : 'rgba(255,255,255,.045)',
            opacity: over ? 0.35 : 1,
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.08em',
                          color: r.buyout ? INUSE : 'rgba(255,255,255,.8)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {r.setLabel}
            </div>
            {r.guestName && (
              <div style={{ fontSize: 14, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {r.guestName}
              </div>
            )}
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.5)', whiteSpace: 'nowrap' }}>
              {clock(r.startISO)}–{clock(r.endISO)}
            </div>
          </div>
        )
      })}

      {/* The line every calendar has: where you are in the day. */}
      {showNow && nowH >= lo && nowH <= hi && (
        <div style={{ position: 'absolute', left: 0, right: 0, top: `${pct(nowH)}%`, pointerEvents: 'none' }}>
          <div style={{ position: 'absolute', left: 0, top: -7, fontSize: 11, fontWeight: 800, color: '#ff6b6b' }}>
            {new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(new Date(nowMs))}
          </div>
          <div style={{ marginLeft: 30, height: 2, background: '#ff4d4d', borderRadius: 2 }} />
          <div style={{ position: 'absolute', left: 27, top: -3, width: 8, height: 8, borderRadius: '50%', background: '#ff4d4d' }} />
        </div>
      )}
    </div>
  )
}

// The plain list. Default view: it reads fastest when you just want to know
// what is next, and it does not care how empty the morning was.
function AgendaList({ agenda, nowMs, showNow }: { agenda: AgendaRow[]; nowMs: number; showNow: boolean }) {
  const nowLine = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '6px 0' }}>
      <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ff4d4d', flexShrink: 0 }} />
      <span style={{ flex: 1, height: 2, background: '#ff4d4d', borderRadius: 2 }} />
      <span style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.1em', color: '#ff6b6b', whiteSpace: 'nowrap' }}>
        {new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(new Date(nowMs))}
      </span>
    </div>
  )
  const allStarted = showNow && agenda.length > 0 && agenda.every(r => Date.parse(r.startISO) <= nowMs)
  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', paddingRight: 6, display: 'flex', flexDirection: 'column' }}>
      {agenda.length === 0 && (
        <div style={{ fontSize: 15, color: 'rgba(255,255,255,.4)' }}>Nothing on the books.</div>
      )}
      {agenda.map((r, i) => {
        const started = Date.parse(r.startISO) <= nowMs
        const over = Date.parse(r.endISO) <= nowMs
        // The boundary between what is done and what is coming.
        const lineHere = showNow && !started && (i === 0 || Date.parse(agenda[i - 1].startISO) <= nowMs)
        return (
          // Rows share the free height so the list fills its column, but they
          // stop growing before a two-booking day turns into three giant slabs.
          <div key={r.id} style={{ flex: '1 1 0', minHeight: 58, maxHeight: 108, display: 'flex', flexDirection: 'column' }}>
            {lineHere && nowLine}
            <div style={{
              flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center',
              padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,.06)', opacity: over ? 0.38 : 1,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'baseline' }}>
                <span style={{ fontSize: 13, fontWeight: 800, letterSpacing: '.1em',
                               color: r.buyout ? INUSE : 'rgba(255,255,255,.82)' }}>{r.setLabel}</span>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,.55)', whiteSpace: 'nowrap' }}>
                  {clock(r.startISO)}–{clock(r.endISO)}
                </span>
              </div>
              {r.guestName && <div style={{ fontSize: 16, fontWeight: 600, marginTop: 3 }}>{r.guestName}</div>}
            </div>
          </div>
        )
      })}
      {allStarted && nowLine}
    </div>
  )
}

const dayNavBtn: React.CSSProperties = {
  background: 'none', border: '1px solid rgba(255,255,255,.14)', borderRadius: 7,
  color: 'rgba(255,255,255,.55)', width: 24, height: 22, lineHeight: 1, cursor: 'pointer',
  fontFamily: 'Inter, sans-serif', fontSize: 13, padding: 0,
}

// Today's date in CENTRAL as YYYY-MM-DD. en-CA formats that way natively, which
// avoids hand-assembling a string and getting the month off by one.
function centralToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
}

// ⚠️ Shift by whole days at UTC NOON. Anchoring at midnight and adding 24h lands
// on the wrong date across a DST boundary; noon has 12 hours of slack either way.
function shiftDate(ymd: string, days: number): string {
  const [y, m, d] = ymd.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d, 12))
  t.setUTCDate(t.getUTCDate() + days)
  return t.toISOString().slice(0, 10)
}

function dayLabel(offset: number): string {
  if (offset === 0) return 'TODAY'
  if (offset === 1) return 'TOMORROW'
  if (offset === -1) return 'YESTERDAY'
  const ymd = shiftDate(centralToday(), offset)
  const [y, m, d] = ymd.split('-').map(Number)
  return new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' })
    .format(new Date(Date.UTC(y, m - 1, d, 12))).toUpperCase()
}
