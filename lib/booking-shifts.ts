import { supabaseAdmin } from '@/lib/supabase'
import { type WorkerClass } from '@/lib/onboarding'

// Supabase returns a to-one relation as an object, but the generated types
// sometimes shape it as an array — read either safely.
function relName(rel: any): string | null {
  if (!rel) return null
  return Array.isArray(rel) ? (rel[0]?.name ?? null) : (rel.name ?? null)
}

export type StaffedShift = {
  id: string
  worker_class: WorkerClass
  state: 'open' | 'claimed' | 'cancelled' | 'past'
  claimer_name: string | null
}

export type StaffableBooking = {
  booking_id: string
  start_time: string
  end_time: string
  set_name: string | null
  guest_count: number | null
  shift: StaffedShift | null   // the (non-cancelled, if any) shift already covering it
}

// Upcoming, non-cancelled bookings and whether each already has a shift posted.
export async function getStaffableBookings(now = Date.now()): Promise<StaffableBooking[]> {
  const admin = supabaseAdmin()
  const nowIso = new Date(now).toISOString()
  const { data: bookings } = await admin.from('bookings')
    .select('id, start_time, end_time, guest_count, sets(name)')
    .neq('status', 'cancelled').gte('end_time', nowIso)
    .order('start_time', { ascending: true }).limit(80)
  const rows = (bookings ?? []) as any[]
  if (!rows.length) return []

  const ids = rows.map(b => b.id)
  const { data: shiftRows } = await admin.from('shifts')
    .select('id, booking_id, worker_class, claimed_by, cancelled_at, ends_at').in('booking_id', ids)
  const sRows = (shiftRows ?? []) as any[]

  // Prefer a non-cancelled shift when a booking somehow has more than one.
  const byBooking = new Map<string, any>()
  for (const s of sRows) {
    if (!s.booking_id) continue
    const cur = byBooking.get(s.booking_id)
    if (!cur || (cur.cancelled_at && !s.cancelled_at)) byBooking.set(s.booking_id, s)
  }

  const claimerIds = [...new Set(sRows.map(s => s.claimed_by).filter(Boolean))] as string[]
  const nameById = new Map<string, string | null>()
  if (claimerIds.length) {
    const { data: ws } = await admin.from('worker_profiles').select('id, full_name, email').in('id', claimerIds)
    for (const w of (ws ?? []) as any[]) nameById.set(w.id, w.full_name || w.email || null)
  }

  return rows.map(b => {
    const s = byBooking.get(b.id)
    let shift: StaffedShift | null = null
    if (s) {
      const state: StaffedShift['state'] = s.cancelled_at ? 'cancelled'
        : new Date(s.ends_at).getTime() < now ? 'past'
        : s.claimed_by ? 'claimed' : 'open'
      shift = { id: s.id, worker_class: s.worker_class, state, claimer_name: s.claimed_by ? (nameById.get(s.claimed_by) ?? null) : null }
    }
    return {
      booking_id: b.id, start_time: b.start_time, end_time: b.end_time,
      set_name: relName(b.sets), guest_count: b.guest_count ?? null, shift,
    }
  })
}

// Post an OPEN shift matching a booking's window (dedupes per booking).
export async function createShiftFromBooking(bookingId: string, workerClass: WorkerClass, notes?: string): Promise<{ ok: boolean; error?: string; id?: string }> {
  const admin = supabaseAdmin()
  const { data: b } = await admin.from('bookings')
    .select('id, start_time, end_time, status, sets(name)').eq('id', bookingId).maybeSingle()
  if (!b) return { ok: false, error: 'That booking no longer exists.' }
  if ((b as any).status === 'cancelled') return { ok: false, error: 'That booking is cancelled.' }

  const { data: existing } = await admin.from('shifts').select('id, cancelled_at').eq('booking_id', bookingId)
  if (((existing ?? []) as any[]).some(s => !s.cancelled_at)) return { ok: false, error: 'This booking already has a shift.' }

  const setName = relName((b as any).sets)
  const noteText = (notes && notes.trim()) || (setName ? `${setName} booking` : 'Booking')
  const now = new Date().toISOString()
  const { data: ins, error } = await admin.from('shifts').insert({
    starts_at: (b as any).start_time, ends_at: (b as any).end_time,
    worker_class: workerClass, notes: noteText, booking_id: bookingId,
    created_at: now, updated_at: now,
  }).select('id').maybeSingle()
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: (ins as any)?.id }
}
