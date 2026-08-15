// Floor status — what every tracked room in the building is doing right now.
//
// ⚠️ THE STATE IS DERIVED, NEVER STORED. floor_areas records only WHEN a room
// was last cleared (and, for facilities, when it was flagged). Everything else
// is computed here against live bookings:
//
//     IN USE  — a confirmed booking is running on that set now (or starts within
//               30 min), or a full-studio buyout has the whole building
//     DIRTY   — a set whose last booking ENDED after it was last cleared,
//               or a facility flagged since it was last cleared
//     READY   — anything else
//
// A stored status column would need a cron to keep it true and would silently
// go wrong the first time a booking is moved or cancelled. This cannot drift,
// and there is no scheduled job to fail quietly at 3 AM.
//
// ⚠️ Compare instants with Date.parse, NEVER as strings — `...T15:00:00+00:00`
// and `...T10:00:00-05:00` are the same moment spelled differently, and that
// exact mistake once made a no-op reschedule report success.

import { supabaseAdmin } from '@/lib/supabase'

export type FloorState = 'inuse' | 'ready' | 'dirty'

export interface FloorArea {
  code: string
  label: string
  kind: 'set' | 'facility'
  state: FloorState
  /** IN USE only — when the room frees up. */
  untilISO: string | null
  /** DIRTY sets only — when the session that dirtied it ended. Facilities have
   *  no such moment, so this stays null and the board shows no clock for them. */
  dirtySinceISO: string | null
  clearedAt: string | null
  clearedBy: string | null
}

interface AreaRow {
  code: string; label: string; kind: 'set' | 'facility'; set_id: string | null
  sort_order: number; cleared_at: string | null; cleared_by: string | null
  flagged_at: string | null
}

const ARRIVE_WINDOW_MS = 30 * 60 * 1000
// Bounds the "what ended recently" query for an area that has never been
// cleared. Anything dirtier than this is a housekeeping problem, not a data one.
const LOOKBACK_FLOOR_MS = 7 * 24 * 60 * 60 * 1000

export async function readFloor(): Promise<FloorArea[]> {
  const db = supabaseAdmin()
  const now = Date.now()

  const { data: areaRows, error: areaErr } = await db
    .from('floor_areas')
    .select('code, label, kind, set_id, sort_order, cleared_at, cleared_by, flagged_at')
    .order('sort_order', { ascending: true })
  // ⚠️ supabase-js does not throw. A failed read must not render as "everything
  // is fine" — an empty board is the honest answer, and the caller says so.
  if (areaErr) { console.error('[floor] area read failed:', areaErr.message); return [] }
  const areas = (areaRows ?? []) as AreaRow[]
  if (!areas.length) return []

  const clearedMs = (a: AreaRow) => (a.cleared_at ? Date.parse(a.cleared_at) : 0)
  const lookbackFrom = Math.min(
    now - LOOKBACK_FLOOR_MS,
    ...areas.map(a => clearedMs(a) || now - LOOKBACK_FLOOR_MS),
  )

  // Everything confirmed that either is happening now or ended since the
  // earliest clear. One query, not one per room.
  const { data: bookingRows, error: bkErr } = await db
    .from('bookings')
    .select('id, set_id, start_time, end_time')
    .eq('status', 'confirmed')
    .gt('end_time', new Date(lookbackFrom).toISOString())
    .lte('start_time', new Date(now + ARRIVE_WINDOW_MS).toISOString())
  if (bkErr) { console.error('[floor] booking read failed:', bkErr.message); return [] }
  const bookings = (bookingRows ?? []) as { id: string; set_id: string | null; start_time: string; end_time: string }[]

  // A full-studio buyout (set_id null) occupies every set at once, and dirties
  // every set when it ends — treating it as "no set" would show an empty
  // building while the whole warehouse is rented.
  const live = bookings.filter(b => Date.parse(b.end_time) > now)
  const ended = bookings.filter(b => Date.parse(b.end_time) <= now)
  const liveBuyout = live.filter(b => b.set_id === null)
    .sort((a, b) => Date.parse(b.end_time) - Date.parse(a.end_time))[0] ?? null
  const buyoutEndedAt = Math.max(0, ...ended.filter(b => b.set_id === null).map(b => Date.parse(b.end_time)))

  return areas.map<FloorArea>(a => {
    const base = {
      code: a.code, label: a.label, kind: a.kind,
      clearedAt: a.cleared_at, clearedBy: a.cleared_by,
    }

    if (a.kind === 'facility') {
      // No bookings ever touch a restroom or the vanity — only a staff tap
      // moves them, and there is deliberately no timer and no clock.
      const flagged = a.flagged_at ? Date.parse(a.flagged_at) : 0
      const dirty = flagged > clearedMs(a)
      return { ...base, state: dirty ? 'dirty' : 'ready', untilISO: null, dirtySinceISO: null }
    }

    const mine = live.filter(b => b.set_id === a.set_id)
      .sort((x, y) => Date.parse(y.end_time) - Date.parse(x.end_time))[0] ?? null
    const occupant = mine ?? liveBuyout
    if (occupant) {
      return { ...base, state: 'inuse', untilISO: occupant.end_time, dirtySinceISO: null }
    }

    // Nobody in it. Did anything finish in here since it was last cleared?
    const lastOwnEnd = Math.max(0, ...ended.filter(b => b.set_id === a.set_id).map(b => Date.parse(b.end_time)))
    const lastEnd = Math.max(lastOwnEnd, buyoutEndedAt)
    if (lastEnd > clearedMs(a)) {
      return { ...base, state: 'dirty', untilISO: null, dirtySinceISO: new Date(lastEnd).toISOString() }
    }
    return { ...base, state: 'ready', untilISO: null, dirtySinceISO: null }
  })
}
