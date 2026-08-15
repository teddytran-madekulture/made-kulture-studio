"use client"

// The floor status board — every tracked room in the building, by colour.
//
// Drawn from the real building plan (Building Plans/Set Layou.jpg), stripped to
// rooms only: no streets, parking, ramp, stairs or door swings. Geometry is in a
// 910x890 viewBox and scales to whatever screen it lands on.
//
// ⚠️ NO GUEST NAMES. This renders on the desk lock screen, which sits where
// anyone can see it. The board says a room is busy and when it frees up; who is
// in it is a question for someone who has unlocked the tablet.

import { useCallback, useEffect, useState } from 'react'

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
  untilISO: string | null; dirtySinceISO: string | null
  clearedAt: string | null; clearedBy: string | null
}

const clock = (iso: string) =>
  new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' })
    .format(new Date(iso))

export default function FloorBoard({ onPickRoom }: { onPickRoom?: (a: Area) => void }) {
  const [areas, setAreas] = useState<Area[] | null>(null)
  const [err, setErr] = useState('')

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/floor/board', { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      if (!r.ok) { setErr(d.error || 'Could not read the floor.'); return }
      setAreas(d.areas ?? []); setErr('')
    } catch {
      // Keep showing the last known state rather than blanking the wall.
      setErr('Offline — showing the last known state.')
    }
  }, [])

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

  const byCode = new Map((areas ?? []).map(a => [a.code, a]))
  const counts = { inuse: 0, ready: 0, dirty: 0 }
  for (const a of areas ?? []) counts[a.state]++
  const dirtyList = (areas ?? []).filter(a => a.state === 'dirty')

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', color: '#fff', fontFamily: 'Inter, sans-serif' }}>
      <div style={{ padding: '18px 28px 6px', display: 'flex', alignItems: 'center', gap: 24, flexShrink: 0 }}>
        <div style={{ fontWeight: 900, letterSpacing: '.3em', fontSize: 18, whiteSpace: 'nowrap' }}>MADE KULTURE</div>
        <div style={{ fontSize: 12, letterSpacing: '.16em', color: 'rgba(201,178,126,.55)', whiteSpace: 'nowrap' }}>
          {err ? err.toUpperCase() : 'FLOOR STATUS'}
        </div>
        <div style={{ display: 'flex', gap: 24, marginLeft: 'auto', alignItems: 'baseline' }}>
          {([['inuse', 'IN USE'], ['ready', 'READY'], ['dirty', 'NEED CLEANING']] as const).map(([k, w]) => (
            <div key={k} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
              <b style={{ fontSize: 32, fontWeight: 800, color: LINE[k] }}>{counts[k]}</b>
              <span style={{ fontSize: 11, letterSpacing: '.18em', color: 'rgba(255,255,255,.5)' }}>{w}</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', gap: 24, padding: '2px 28px 16px' }}>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <svg viewBox="0 0 910 890" preserveAspectRatio="xMidYMid meet" style={{ width: '100%', height: '100%' }}>
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
              const tap = a && onPickRoom ? () => onPickRoom(a) : undefined
              return (
                <g key={sh.code} onClick={tap} style={{ cursor: tap ? 'pointer' : 'default' }}>
                  {sh.poly
                    ? <polygon points={sh.poly} fill={FILL[st]} stroke={LINE[st]} strokeWidth={2} />
                    : <rect x={sh.x} y={sh.y} width={sh.w} height={sh.h} rx={9} fill={FILL[st]} stroke={LINE[st]} strokeWidth={2} />}
                  {/* ⚠️ A 53x36 target is hard to hit on a wall tablet, especially
                      reaching up. Give the small shapes an invisible pad so you
                      do not have to aim to mark a closet clean. */}
                  {sh.outside && tap && (
                    <rect x={sh.x! - 26} y={sh.y! - 26} width={sh.w! + 52} height={sh.h! + 78} fill="transparent" />
                  )}
                  {sh.outside ? (
                    <>
                      <text x={cx} y={sh.y! + sh.h! + 15} textAnchor="middle" dominantBaseline="middle"
                        style={{ fontSize: 12, fontWeight: 800, letterSpacing: '.06em', fill: '#fff' }}>{label}</text>
                      <text x={cx} y={sh.y! + sh.h! + 30} textAnchor="middle" dominantBaseline="middle"
                        style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.16em', fill: LINE[st] }}>{WORD[st]}</text>
                    </>
                  ) : (
                    <>
                      <text x={cx} y={cy - 9} textAnchor="middle" dominantBaseline="middle"
                        style={{ fontSize: sh.small ? 12 : 15, fontWeight: 800, letterSpacing: '.06em', fill: '#fff' }}>{label}</text>
                      <text x={cx} y={cy + 12} textAnchor="middle" dominantBaseline="middle"
                        style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.16em', fill: LINE[st] }}>{WORD[st]}</text>
                    </>
                  )}
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
          </div>

          <div style={{ border: '1px solid rgba(255,92,92,.45)', borderRadius: 16, padding: '14px 17px', background: 'rgba(255,92,92,.06)' }}>
            <div style={{ fontSize: 10, letterSpacing: '.3em', color: '#ff9b9b', fontWeight: 700, marginBottom: 10 }}>NEEDS CLEANING</div>
            {dirtyList.length === 0 ? (
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,.45)' }}>
                {areas ? 'Nothing waiting — whole floor is clear.' : 'Reading the floor…'}
              </div>
            ) : dirtyList.map(a => (
              <div key={a.code} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'baseline', fontSize: 15, fontWeight: 600, marginBottom: 7 }}>
                <span>{a.label}</span>
                {/* A set knows WHEN it got dirty — a session ended at a known
                    time. A facility never does, so it shows no clock. */}
                <em style={{ fontStyle: 'normal', fontWeight: 400, fontSize: 12, color: 'rgba(255,255,255,.42)', whiteSpace: 'nowrap' }}>
                  {a.dirtySinceISO ? `since ${clock(a.dirtySinceISO)}` : 'flagged by staff'}
                </em>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
