import type { SupabaseClient } from '@supabase/supabase-js'

const ACTIVE_STATUSES = ['pending', 'confirmed', 'pending_payment']

// Houston-local decimal hour for an ISO timestamp (e.g. 13.5 = 1:30pm).
function chiHour(iso: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso))
  const h = Number(parts.find(p => p.type === 'hour')?.value ?? 0) % 24
  const m = Number(parts.find(p => p.type === 'minute')?.value ?? 0)
  return h + m / 60
}

// What is already on the floor inside a takeover window: the set bookings the
// takeover would share with, and whether another takeover (set_id NULL) blocks
// it outright. Set names only — this is shown to the OWNER and, as set + time
// with no names, to the customer.
export async function sharedFloorSets(
  supabase: SupabaseClient, startISO: string, endISO: string, excludeBookingId?: string
): Promise<{ buyoutConflict: boolean; sets: { setName: string; startHour: number; endHour: number }[] }> {
  const { data, error } = await supabase
    .from('bookings')
    .select('id, set_id, start_time, end_time')
    .in('status', ACTIVE_STATUSES)
    .lt('start_time', endISO)
    .gt('end_time', startISO)
  if (error) throw new Error(`shared-floor check failed: ${error.message}`)
  const rows = (data ?? []).filter(b => !excludeBookingId || b.id !== excludeBookingId)
  const buyoutConflict = rows.some(b => b.set_id == null)
  const setIds = Array.from(new Set(rows.filter(b => b.set_id != null).map(b => String(b.set_id))))
  const names: Record<string, string> = {}
  if (setIds.length) {
    const { data: sets } = await supabase.from('sets').select('id, name').in('id', setIds)
    for (const s of sets ?? []) names[String(s.id)] = s.name
  }
  const sets = rows.filter(b => b.set_id != null)
    .map(b => ({ setName: names[String(b.set_id)] || 'A set', startHour: chiHour(b.start_time), endHour: chiHour(b.end_time) }))
    .sort((a, b) => a.startHour - b.startHour)
  return { buyoutConflict, sets }
}
