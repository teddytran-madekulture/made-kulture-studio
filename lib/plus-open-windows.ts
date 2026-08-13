// Plus short-notice booking — instant booking inside hours the studio is ALREADY open.
//
// WHY THIS EXISTS
// The 48-hour advance window is not about inventory. It exists because a session
// assumes NOTICE: door PINs, cleaning, turnaround, and somebody physically
// opening the building. When a confirmed shoot is already running, the building
// is already open and staffed — that cost is paid. This file computes exactly
// the blocks where that is true, and nothing wider.
//
// The same rule already governs studio tours (app/api/tours/slots/route.ts):
// a tour is only offered where a confirmed single-set booking is in progress,
// and a full-studio buyout erases everything. This is that rule, applied to
// booking instead of visiting.
//
// ⚠️ Everything here is PURE. The server recomputes blocks from the database at
// booking time — the client's copy is display only and is never trusted.

export interface Interval { start: number; end: number }   // ms epoch, half-open [start, end)

// Matches the tour lead time. Long enough for the door PIN to mint, the
// confirmation to land, and the owner to see it coming.
export const PLUS_LEAD_MS = 2 * 60 * 60 * 1000

// ⚠️ ASYMMETRY, ON PURPOSE:
//  • ANCHOR (what makes the studio "open") = 'confirmed' only. A delegated
//    payment hold is not somebody standing in the building.
//  • BLOCKING (what makes a set unavailable) = every active status, matching
//    ACTIVE_STATUSES in lib/set-availability.ts. A held set is not bookable.
export const ANCHOR_STATUSES = ['confirmed']
export const BLOCKING_STATUSES = ['pending', 'confirmed', 'pending_payment']

export interface BookingRow {
  start_time: string
  end_time: string
  set_id: string | null      // null = FULL STUDIO BUYOUT, never "missing data"
  status: string
}

// Merge overlapping or exactly-touching intervals into a minimal set.
// Touching matters: two back-to-back shoots (2–4 and 4–6) leave the building
// open continuously from 2 to 6, so they must become one window.
export function mergeIntervals(list: Interval[]): Interval[] {
  const sorted = list.filter(i => i.end > i.start).sort((a, b) => a.start - b.start)
  const out: Interval[] = []
  for (const cur of sorted) {
    const last = out[out.length - 1]
    if (last && cur.start <= last.end) last.end = Math.max(last.end, cur.end)
    else out.push({ start: cur.start, end: cur.end })
  }
  return out
}

// base minus cut. Used twice: buyouts removed from open windows, and a set's
// own bookings removed from what that set can offer.
export function subtractIntervals(base: Interval[], cut: Interval[]): Interval[] {
  const cuts = mergeIntervals(cut)
  let out = base.map(i => ({ ...i }))
  for (const c of cuts) {
    const next: Interval[] = []
    for (const b of out) {
      if (c.end <= b.start || c.start >= b.end) { next.push(b); continue }  // no overlap
      if (c.start > b.start) next.push({ start: b.start, end: c.start })    // left remainder
      if (c.end   < b.end)   next.push({ start: c.end,   end: b.end })      // right remainder
    }
    out = next
  }
  return out.filter(i => i.end > i.start)
}

const toInterval = (b: BookingRow): Interval => ({
  start: Date.parse(b.start_time),
  end:   Date.parse(b.end_time),
})

// Hours the studio is open: the union of confirmed SET bookings, with every
// buyout window removed. During a buyout the client has the whole warehouse and
// nobody else may be in it — so a buyout subtracts rather than anchors.
export function openWindowsFrom(bookings: BookingRow[]): Interval[] {
  const anchors: Interval[] = []
  const buyouts: Interval[] = []
  for (const b of bookings) {
    if (!ANCHOR_STATUSES.includes(b.status)) continue
    if (b.set_id === null) buyouts.push(toInterval(b))
    else anchors.push(toInterval(b))
  }
  return subtractIntervals(mergeIntervals(anchors), buyouts)
}

// Align a block to the 30-minute grid the booking UI uses: a start may only be
// on a half hour, so round the start UP and the end DOWN. A block that no longer
// fits its minimum after alignment is dropped by the caller.
const HALF_HOUR = 30 * 60 * 1000
const alignInward = (i: Interval): Interval => ({
  start: Math.ceil(i.start / HALF_HOUR) * HALF_HOUR,
  end:   Math.floor(i.end / HALF_HOUR) * HALF_HOUR,
})

// Blocks a Plus member may instant-book on one set.
//
//   openWindows   — from openWindowsFrom() (already buyout-free)
//   setBookings   — that set's own bookings in any BLOCKING status
//   minHours      — the set's minimum session length (buyout minimum never
//                   applies here: a buyout can't fit inside someone else's shoot)
//   nowMs/leadMs  — no instant booking closer than the lead time
export function instantBlocksForSet(
  openWindows: Interval[],
  setBookings: BookingRow[],
  minHours: number,
  nowMs: number,
  leadMs: number = PLUS_LEAD_MS,
): Interval[] {
  const free = subtractIntervals(openWindows, setBookings.map(toInterval))
  const earliest = nowMs + leadMs
  const minMs = Math.max(1, minHours) * 60 * 60 * 1000

  return free
    // Trim the part of a block that is already inside the lead time rather than
    // dropping the whole block — a 2–6pm window at 3pm should still offer 5–6pm.
    .map(i => ({ start: Math.max(i.start, earliest), end: i.end }))
    .filter(i => i.end > i.start)
    .map(alignInward)
    .filter(i => i.end - i.start >= minMs)
}

// THE SERVER CHECK. True only when [startMs, endMs) sits entirely inside a
// single instant-bookable block. Spanning two blocks is not allowed — the gap
// between them is time the studio is not open.
export function isInstantBookable(blocks: Interval[], startMs: number, endMs: number): boolean {
  if (!(endMs > startMs)) return false
  return blocks.some(b => startMs >= b.start && endMs <= b.end)
}
