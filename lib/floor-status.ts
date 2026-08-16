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
import { bookingHourToISO, centralDateStr, nextDay } from '@/lib/booking-times'

export type FloorState = 'inuse' | 'ready' | 'dirty'

export interface FloorArea {
  code: string
  label: string
  kind: 'set' | 'facility'
  state: FloorState
  /** IN USE only — when the room frees up. */
  untilISO: string | null
  /** Booked but NOT started yet — when it starts. A room can be ready-and-booked
   *  or dirty-and-booked; both matter, and neither is "in use". */
  startsISO: string | null
  /** DIRTY sets only — when the session that dirtied it ended. Facilities have
   *  no such moment, so this stays null and the board shows no clock for them. */
  dirtySinceISO: string | null
  clearedAt: string | null
  clearedBy: string | null
  /** Who is in here (or due in here). ⚠️ ONLY populated for a FULL staff or admin
   *  session — never for a locked one, because the locked board is the screen a
   *  stranger at the front desk can read. */
  guestName: string | null
  /** Phone doubles as the deep link into /desk, whose search matches it. */
  guestPhone: string | null
  /** True when this room's guest is here via a FULL-STUDIO BUYOUT rather than a
   *  booking of its own. The board collapses these into one banner instead of
   *  printing the same name on nine rooms. */
  viaBuyout: boolean
  /** IN USE, but nobody ever cleared what the last session left. Occupancy wins
   *  the colour — you cannot clean an occupied room — but the dirt is still a
   *  fact and the board must not swallow it. */
  alsoDirty: boolean
}

interface AreaRow {
  code: string; label: string; kind: 'set' | 'facility'; set_id: string | null
  sort_order: number; cleared_at: string | null; cleared_by: string | null
  flagged_at: string | null
}

// ⚠️ This is a LOOK-AHEAD FOR THE QUERY, NOT A DEFINITION OF "IN USE". The kiosk's
// occupancy helper counts a booking starting within 30 min as occupying the set,
// because a tablet should greet someone who arrives early. A FLOOR BOARD must not:
// painting a room gold at 5:30 for a 6:00 booking says guests are in a room that
// is empty. Here the window only decides what to FETCH; `running` decides colour.
const ARRIVE_WINDOW_MS = 30 * 60 * 1000
// Bounds the "what ended recently" query for an area that has never been
// cleared. Anything dirtier than this is a housekeeping problem, not a data one.
const LOOKBACK_FLOOR_MS = 7 * 24 * 60 * 60 * 1000

export async function readFloor(opts: { withGuest?: boolean } = {}): Promise<FloorArea[]> {
  const withGuest = !!opts.withGuest
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
    // ⚠️ One literal select string — concatenating it kills supabase-js row
    // inference and every field comes back as GenericStringError.
    .select('id, set_id, start_time, end_time, customers ( name, phone )')
    .eq('status', 'confirmed')
    .gt('end_time', new Date(lookbackFrom).toISOString())
    .lte('start_time', new Date(now + ARRIVE_WINDOW_MS).toISOString())
  if (bkErr) { console.error('[floor] booking read failed:', bkErr.message); return [] }
  interface Bk {
    id: string; set_id: string | null; start_time: string; end_time: string
    customers: { name: string | null; phone: string | null } | { name: string | null; phone: string | null }[] | null
  }
  const bookings = (bookingRows ?? []) as unknown as Bk[]
  const guestOf = (b: Bk | null) => {
    const viaBuyout = !!b && b.set_id === null
    if (!b || !withGuest) return { guestName: null, guestPhone: null, viaBuyout }
    const c = Array.isArray(b.customers) ? b.customers[0] : b.customers
    return { guestName: c?.name ?? null, guestPhone: c?.phone ?? null, viaBuyout }
  }

  // A full-studio buyout (set_id null) occupies every set at once, and dirties
  // every set when it ends — treating it as "no set" would show an empty
  // building while the whole warehouse is rented.
  const running = bookings.filter(b => Date.parse(b.end_time) > now && Date.parse(b.start_time) <= now)
  const soon    = bookings.filter(b => Date.parse(b.start_time) > now)
  const ended   = bookings.filter(b => Date.parse(b.end_time) <= now)
  const runningBuyout = running.filter(b => b.set_id === null)
    .sort((a, b) => Date.parse(b.end_time) - Date.parse(a.end_time))[0] ?? null
  const soonBuyout = soon.filter(b => b.set_id === null)
    .sort((a, b) => Date.parse(a.start_time) - Date.parse(b.start_time))[0] ?? null
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
      return { ...base, state: dirty ? 'dirty' : 'ready', untilISO: null, startsISO: null, dirtySinceISO: null,
               guestName: null, guestPhone: null, viaBuyout: false, alsoDirty: false }
    }

    // ⚠️ Dirtiness is computed FIRST. Deciding it only after the occupancy check
    // is how a room that was never cleaned goes quiet the moment somebody walks
    // into it — the board would say the floor is clear while a guest stands in
    // last session's mess.
    const lastOwnEndPre = Math.max(0, ...ended.filter(b => b.set_id === a.set_id).map(b => Date.parse(b.end_time)))
    const lastEndPre = Math.max(lastOwnEndPre, buyoutEndedAt)
    const flaggedPre = a.flagged_at ? Date.parse(a.flagged_at) : 0
    const clearedPre = clearedMs(a)
    const isDirty = lastEndPre > clearedPre || flaggedPre > clearedPre

    // Actually STARTED. A buyout holds every set, so it stands in for this one.
    const mine = running.filter(b => b.set_id === a.set_id)
      .sort((x, y) => Date.parse(y.end_time) - Date.parse(x.end_time))[0] ?? null
    const occupant = mine ?? runningBuyout
    if (occupant) {
      return { ...base, state: 'inuse', untilISO: occupant.end_time, startsISO: null,
               dirtySinceISO: isDirty && lastEndPre > clearedPre ? new Date(lastEndPre).toISOString() : null,
               alsoDirty: isDirty, ...guestOf(occupant) }
    }

    // Not started. Somebody may still be due in here shortly, which matters most
    // when the room is also dirty.
    const mineSoon = soon.filter(b => b.set_id === a.set_id)
      .sort((x, y) => Date.parse(x.start_time) - Date.parse(y.start_time))[0] ?? soonBuyout
    const startsISO = mineSoon?.start_time ?? null

    // Nobody in it. Did anything finish in here since it was last cleared —
    // or did somebody flag it by hand?
    //
    // ⚠️ A SET CAN BE FLAGGED MANUALLY TOO. This was refused at first on the
    // theory that a hand flag would fight the derived state; it does not. The
    // two conditions simply OR, and a clear beats both because `cleared_at`
    // then post-dates them. Sets get dirty without a booking ending all the
    // time — a spill, a tour walking through, a guest who left it wrecked
    // mid-session — and the board has to be able to say so.
    const lastEnd = lastEndPre
    const cleared = clearedPre
    if (isDirty) {
      return {
        ...base, state: 'dirty', untilISO: null, startsISO, alsoDirty: false, ...guestOf(mineSoon),
        // Only a session end is a KNOWN moment. A hand flag shows no clock,
        // same as a facility, because "flagged at 3pm" is not "dirty since 3pm".
        dirtySinceISO: lastEnd > cleared ? new Date(lastEnd).toISOString() : null,
      }
    }
    return { ...base, state: 'ready', untilISO: null, startsISO, dirtySinceISO: null, alsoDirty: false, ...guestOf(mineSoon) }
  })
}


// ── Today's schedule, for the agenda beside the board ────────────────────────
//
// ⚠️ "Today" means the CENTRAL day, not a UTC one. Slicing 24 hours off
// `new Date()` would put an 11 PM booking on tomorrow's list — the same class of
// mistake that once labelled a 2-6 PM session as 7-11 pm.

export interface AgendaRow {
  id: string
  setLabel: string
  startISO: string
  endISO: string
  /** ⚠️ Null for a locked viewer — same boundary as the board itself. */
  guestName: string | null
  guestPhone: string | null
  buyout: boolean
}

export async function readAgenda(opts: { withGuest?: boolean; date?: string } = {}): Promise<AgendaRow[]> {
  const db = supabaseAdmin()
  // ⚠️ A CENTRAL day, not a UTC one, and the boundaries go through
  // bookingHourToISO so they survive the DST change. Slicing 24 hours off
  // `new Date()` would put an 11 PM booking on the next day's list.
  const day = /^\d{4}-\d{2}-\d{2}$/.test(opts.date ?? '')
    ? opts.date!
    : centralDateStr(new Date().toISOString())
  const dayStart = bookingHourToISO(day, 0)
  const dayEnd = bookingHourToISO(nextDay(day), 0)

  const { data, error } = await db
    .from('bookings')
    .select('id, start_time, end_time, set_id, sets ( name ), customers ( name, phone )')
    .eq('status', 'confirmed')
    .gte('start_time', dayStart)
    .lt('start_time', dayEnd)
    .order('start_time', { ascending: true })
  if (error) { console.error('[floor] agenda read failed:', error.message); return [] }

  interface Row {
    id: string; start_time: string; end_time: string; set_id: string | null
    sets: { name: string | null } | { name: string | null }[] | null
    customers: { name: string | null; phone: string | null } | { name: string | null; phone: string | null }[] | null
  }
  const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? v[0] ?? null : v)

  return ((data ?? []) as unknown as Row[]).map(r => {
    const c = one(r.customers)
    const buyout = r.set_id === null
    return {
      id: r.id,
      setLabel: buyout ? 'FULL STUDIO' : (one(r.sets)?.name ?? 'Studio').toUpperCase(),
      startISO: r.start_time,
      endISO: r.end_time,
      guestName: opts.withGuest ? c?.name ?? null : null,
      guestPhone: opts.withGuest ? c?.phone ?? null : null,
      buyout,
    }
  })
}
