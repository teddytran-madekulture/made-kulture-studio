import type { SupabaseClient } from '@supabase/supabase-js'

// Statuses that occupy a set's calendar.
// 'pending_payment' = a delegated ("someone else pays") hold; it reserves the
// slot for the 30-min window while the payer completes payment.
const ACTIVE_STATUSES = ['pending', 'confirmed', 'pending_payment']

export interface SetWindow {
  setId: string
  setName: string
  startISO: string
  endISO: string
}

export interface SetConflict {
  setName: string
  startISO: string
  endISO: string
  reason: string
}

const overlaps = (aStart: string, aEnd: string, bStart: string, bEnd: string) =>
  new Date(aStart) < new Date(bEnd) && new Date(aEnd) > new Date(bStart)

export const BUYOUT_REASON =
  'The whole warehouse is booked for a private buyout during that time.'

// ⚠️ A BUYOUT IS A ROW WITH set_id NULL.
// It means the whole building, so it is attached to no single set -- and that
// shape is exactly why this file was blind to buyouts until 2026-08-21. Every
// check here filters `.eq('set_id', ...)`, and NULL never matches an equality
// test, so the row meaning EVERY set was invisible to the per-set query. It
// cost a real double-booking: a confirmed 2-6pm buyout on 2026-08-22 with two
// website bookings sold inside it nine days later, with no warning at either
// end because the availability GRID is blind the same way.
//
// Buyouts had always been sold through Acuity, which blocks its own set
// calendars, so this only surfaced once website bookings started landing
// against an Acuity buyout.
async function activeBuyouts(
  supabase: SupabaseClient,
  startISO: string,
  endISO: string,
  excludeBookingId?: string
): Promise<{ id: string; start_time: string; end_time: string }[]> {
  // Overlap, not "starts within the day": a buyout running from the previous
  // evening still occupies this morning.
  const { data, error } = await supabase
    .from('bookings')
    .select('id, start_time, end_time')
    .is('set_id', null)
    .in('status', ACTIVE_STATUSES)
    .lt('start_time', endISO)
    .gt('end_time', startISO)

  // Read the error. A failed lookup that returns [] would report "no buyout"
  // and wave the booking through -- the exact failure this patch exists to fix.
  if (error) throw new Error(`buyout availability lookup failed: ${error.message}`)

  return (data ?? []).filter(b => !excludeBookingId || b.id !== excludeBookingId)
}

// Validate a batch of set/time windows BEFORE charging:
//  1. no window collides with an existing active booking for that set
//  2. no two windows in the same order collide with each other (same set)
// ⚠️ `excludeBookingId` exists for RESCHEDULE. A booking being moved is itself an
// ACTIVE row on that set, so without excluding it a move that overlaps its own
// original window conflicts with itself — 6pm→6:30pm would be refused because
// 6pm is "already booked", by the very booking you are moving.
export async function checkSetWindows(
  supabase: SupabaseClient,
  windows: SetWindow[],
  excludeBookingId?: string
): Promise<{ ok: boolean; conflicts: SetConflict[] }> {
  const conflicts: SetConflict[] = []

  // 0. Against any full-warehouse buyout. Checked FIRST because a buyout beats
  //    every per-set answer: the sets are all individually free during one, and
  //    that is precisely what makes the per-set check give the wrong answer.
  if (windows.length) {
    const spanStart = windows.reduce((m, w) => (Date.parse(w.startISO) < Date.parse(m) ? w.startISO : m), windows[0].startISO)
    const spanEnd   = windows.reduce((m, w) => (Date.parse(w.endISO)   > Date.parse(m) ? w.endISO   : m), windows[0].endISO)
    const buyouts   = await activeBuyouts(supabase, spanStart, spanEnd, excludeBookingId)
    for (const w of windows) {
      if (buyouts.some(b => overlaps(w.startISO, w.endISO, b.start_time, b.end_time))) {
        conflicts.push({ setName: w.setName, startISO: w.startISO, endISO: w.endISO, reason: BUYOUT_REASON })
      }
    }
  }

  // 1. Against existing bookings, per set.
  for (const w of windows) {
    const { data: existing } = await supabase
      .from('bookings')
      .select('id, start_time, end_time, status')
      .eq('set_id', w.setId)
      .in('status', ACTIVE_STATUSES)

    const hit = (existing ?? [])
      .filter(b => !excludeBookingId || b.id !== excludeBookingId)
      .some(b => overlaps(w.startISO, w.endISO, b.start_time, b.end_time))
    if (hit) {
      conflicts.push({
        setName: w.setName, startISO: w.startISO, endISO: w.endISO,
        reason: `${w.setName} is already booked during that time.`,
      })
    }
  }

  // Deduplicate: a window blocked by BOTH a buyout and its own set booking
  // should say so once, not twice.
  const seen = new Set<string>()
  const deduped = conflicts.filter(c => {
    const k = `${c.setName}|${c.startISO}|${c.reason}`
    if (seen.has(k)) return false
    seen.add(k); return true
  })
  conflicts.length = 0
  conflicts.push(...deduped)

  // 2. Against each other (same set, overlapping windows in this order).
  for (let i = 0; i < windows.length; i++) {
    for (let j = i + 1; j < windows.length; j++) {
      const a = windows[i], b = windows[j]
      if (a.setId === b.setId && overlaps(a.startISO, a.endISO, b.startISO, b.endISO)) {
        conflicts.push({
          setName: a.setName, startISO: a.startISO, endISO: a.endISO,
          reason: `You selected ${a.setName} twice for overlapping times.`,
        })
      }
    }
  }

  return { ok: conflicts.length === 0, conflicts }
}

// The REVERSE direction: is the floor clear for a whole-building buyout?
//
// ⚠️ Until 2026-08-21 nothing asked this at all. Both booking paths guarded the
// availability check with `if (body.type !== 'studio')`, so a buyout skipped it
// entirely and could be sold over a floor full of confirmed sessions.
//
// A buyout conflicts with ANY active booking in the window -- every set, plus
// any other buyout -- so this deliberately does not filter on set_id.
export async function checkBuyoutWindow(
  supabase: SupabaseClient,
  startISO: string,
  endISO: string,
  excludeBookingId?: string
): Promise<{ ok: boolean; conflicts: SetConflict[] }> {
  const { data, error } = await supabase
    .from('bookings')
    .select('id, start_time, end_time')
    .in('status', ACTIVE_STATUSES)
    .lt('start_time', endISO)
    .gt('end_time', startISO)

  if (error) throw new Error(`buyout floor-check failed: ${error.message}`)

  const blocking = (data ?? []).filter(b => !excludeBookingId || b.id !== excludeBookingId)
  if (!blocking.length) return { ok: true, conflicts: [] }

  // Deliberately a COUNT, never names or sets: this message is shown to a
  // customer at checkout and must not leak who else is in the building.
  const n = blocking.length
  return {
    ok: false,
    conflicts: [{
      setName: 'Full Studio Takeover',
      startISO, endISO,
      reason: `The warehouse isn't free for a full buyout then — there ${n === 1 ? 'is already 1 booking' : `are already ${n} bookings`} on the floor during that window. Text the studio and we'll see what can be moved.`,
    }],
  }
}
