// SERVER-SIDE gate for Plus instant booking inside the 48-hour window.
//
// ⚠️ THIS IS THE ONLY THING THAT GRANTS ACCESS. /api/plus/open-blocks exists to
// draw the UI; it is not permission. Everything here is recomputed from the
// database at booking time, so a hand-rolled POST gets the same answer as the
// booking page.
//
// The advance-window gate was enforced in the browser ONLY until 2026-08-09,
// which meant a direct POST could reserve a slot two hours out. Do not add a
// path around this one.

import { plusActive } from '@/lib/short-notice'
import {
  openWindowsFrom, instantBlocksForSet, isInstantBookable,
  BLOCKING_STATUSES, PLUS_LEAD_MS, type BookingRow,
} from '@/lib/plus-open-windows'

export interface InstantLine {
  setId:    string | null   // null = full studio buyout
  startISO: string
  endISO:   string
}

export const PLUS_INSTANT_ERROR =
  'That time isn’t open for instant booking. Plus lets you book short notice during hours the studio is already open — pick one of the highlighted blocks, or send a request and we’ll get back to you.'

// True only when EVERY line sits entirely inside a block the studio is already
// open for. Any single failing line fails the whole order.
//
// ⚠️ sessionEmail must come from the VERIFIED auth session. Passing body.email
// here would let anyone borrow a member's access by typing their address.
export async function sessionMayInstantBook(
  supabase: any,
  sessionEmail: string | null | undefined,
  lines: InstantLine[],
): Promise<boolean> {
  if (!sessionEmail || !lines.length) return false

  const { data: cust } = await supabase
    .from('customers').select('pricing_overrides')
    .eq('email', String(sessionEmail).toLowerCase().trim()).maybeSingle()
  if (!plusActive(cust?.pricing_overrides ?? null)) return false

  // A full-studio buyout can never qualify: it requires the whole warehouse,
  // which by definition cannot fit inside somebody else's shoot.
  if (lines.some(l => !l.setId)) return false

  const starts = lines.map(l => Date.parse(l.startISO))
  const ends   = lines.map(l => Date.parse(l.endISO))
  if (starts.some(n => !Number.isFinite(n)) || ends.some(n => !Number.isFinite(n))) return false

  // One query covering every line, padded a day each way so a booking that
  // starts before or ends after the requested span still anchors it.
  const DAY = 86400000
  const lo = new Date(Math.min(...starts) - DAY).toISOString()
  const hi = new Date(Math.max(...ends) + DAY).toISOString()

  const [{ data: bookings, error: bErr }, { data: sets, error: sErr }] = await Promise.all([
    supabase.from('bookings')
      .select('start_time, end_time, set_id, status')
      .lt('start_time', hi).gt('end_time', lo),
    supabase.from('sets').select('id, min_hours'),
  ])
  // ⚠️ supabase-js does NOT throw on a Postgres error — read `error` or this
  // silently becomes "no bookings exist", which would open every hour.
  if (bErr || sErr) return false

  const rows = (bookings ?? []) as BookingRow[]
  const open = openWindowsFrom(rows)
  const minHoursById = new Map<string, number>(
    (sets ?? []).map((s: any) => [s.id, Math.max(1, s.min_hours ?? 1)])
  )
  const now = Date.now()

  return lines.every(l => {
    const mine = rows.filter(b => b.set_id === l.setId && BLOCKING_STATUSES.includes(b.status))
    const blocks = instantBlocksForSet(open, mine, minHoursById.get(l.setId!) ?? 1, now, PLUS_LEAD_MS)
    return isInstantBookable(blocks, Date.parse(l.startISO), Date.parse(l.endISO))
  })
}

// ── Anchor cancellation ──────────────────────────────────────────────────────
// A Plus instant booking rests on SOMEBODY ELSE's booking being there. If that
// anchor cancels, the studio is no longer already open and the owner has to
// open it for a session he never approved.
//
// The booking STANDS — no code cancels a paid session. This only tells him.
//
// Detected by recomputing rather than by a flag on the row: a booking is
// orphaned if it WAS inside an open window before the cancellation and is NOT
// inside one after. That needs no schema change and catches the case however
// the booking was created.
export async function findOrphanedByCancel(
  supabase: any,
  cancelled: { id: string; start_time: string; end_time: string; set_id: string | null },
): Promise<Array<{ id: string; setId: string | null; startISO: string; endISO: string; name?: string }>> {
  // Only bookings still inside the short-notice window can be orphaned — beyond
  // it, the booking never needed the studio to be open in the first place.
  const WINDOW_MS = 48 * 60 * 60 * 1000
  const now = Date.now()
  const dayLo = new Date(Date.parse(cancelled.start_time) - 86400000).toISOString()
  const dayHi = new Date(Date.parse(cancelled.end_time) + 86400000).toISOString()

  const { data, error } = await supabase
    .from('bookings')
    .select('id, start_time, end_time, set_id, status, customers(name)')
    .lt('start_time', dayHi).gt('end_time', dayLo)
  // ⚠️ supabase-js does not throw on a Postgres error. Reading `error` here is
  // the difference between "no orphans" and "the query failed".
  if (error) { console.error('[orphan check] query failed:', error.message); return [] }

  const rows = (data ?? []) as any[]
  const live = rows.filter(r => r.status !== 'cancelled' && r.id !== cancelled.id)

  // Windows as they were (with the anchor) vs as they are now (without it).
  const before = openWindowsFrom([...live, { ...cancelled, status: 'confirmed' } as BookingRow])
  const after  = openWindowsFrom(live as BookingRow[])

  const inAny = (w: typeof before, s: number, e: number) =>
    w.some(b => s >= b.start && e <= b.end)

  return live
    .filter(r => {
      if (!r.set_id) return false                                  // a buyout never leaned on this
      const s = Date.parse(r.start_time), e = Date.parse(r.end_time)
      if (s <= now || s - now > WINDOW_MS) return false             // outside the short-notice window
      return inAny(before, s, e) && !inAny(after, s, e)
    })
    .map(r => ({
      id: r.id, setId: r.set_id, startISO: r.start_time, endISO: r.end_time,
      name: r.customers?.name,
    }))
}
