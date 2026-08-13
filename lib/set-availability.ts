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
