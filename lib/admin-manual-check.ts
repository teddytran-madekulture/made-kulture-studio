// Availability check for ADMIN manual bookings (2026-10-07).
//
// The Manual Booking modal (/api/admin/bookings and /api/admin/charge) used to
// insert with NO availability check at all — a full-warehouse buyout could be
// booked straight over two confirmed sessions without a word (Tommy, 10/19).
// Same rules as the admin PATCH route: a conflict refuses with overridable:true,
// and `force` (the "they agreed to share the floor" box) skips the check. The
// database's own overlap constraint still blocks a true set-vs-set double booking.
import type { SupabaseClient } from '@supabase/supabase-js'
import { checkSetWindows, checkBuyoutWindow } from '@/lib/set-availability'
import { bookingHourToISO, bookingEndISO } from '@/lib/booking-times'

export const SLUG_TO_NAME: Record<string, string> = {
  'set-a': 'Set A', 'set-b': 'Set B', 'set-c': 'Set C', 'set-d': 'Set D',
  'concrete': 'Concrete', 'vintage': 'Vintage', 'cottage': 'Cottage',
  'watering-hole': 'The Watering Hole', 'the-tank': 'The Tank', 'studio-one': 'Studio One',
  'studio': 'Full Studio Takeover',
}

/** null = clear to book. Otherwise the JSON + status to return. */
export async function manualBookingConflict(
  db: SupabaseClient,
  b: { setSlug: string; date: string; startHour: number; endHour: number; force?: boolean },
): Promise<{ status: number; body: Record<string, unknown> } | null> {
  if (b.force) return null
  const startISO = bookingHourToISO(b.date, b.startHour)
  const endISO = bookingEndISO(b.date, b.startHour, b.endHour)
  try {
    if (b.setSlug === 'studio') {
      const { ok, conflicts } = await checkBuyoutWindow(db, startISO, endISO, undefined, { ignoreClosures: true })
      if (!ok) return { status: 409, body: { error: `${conflicts.map(c => c.reason).join(' ')} Nothing was booked or charged.`, overridable: true } }
      return null
    }
    const setName = SLUG_TO_NAME[b.setSlug]
    if (!setName) return { status: 400, body: { error: 'Unknown set.' } }
    const { data: s, error } = await db.from('sets').select('id').eq('name', setName).single()
    if (error || !s) return { status: 400, body: { error: `Could not find ${setName}.` } }
    const { ok, conflicts } = await checkSetWindows(db, [{ setId: s.id, setName, startISO, endISO }], undefined, { ignoreClosures: true })
    if (!ok) return { status: 409, body: { error: `${conflicts.map(c => c.reason).join(' ')} Nothing was booked or charged.`, overridable: true } }
    return null
  } catch (e) {
    // A failed lookup must refuse, never report "free" (silent-failure-pattern).
    console.error('[manual booking] availability check failed:', e)
    return { status: 503, body: { error: 'Could not confirm that time is free, so nothing was booked. Try again.' } }
  }
}
