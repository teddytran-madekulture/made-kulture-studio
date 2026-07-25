import { supabaseAdmin } from '@/lib/supabase'
import { type WorkerClass, WORKER_CLASS_LABELS } from '@/lib/onboarding'
import { overlappingShiftExists } from '@/lib/shifts'

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

  if (await overlappingShiftExists(workerClass, (b as any).start_time, (b as any).end_time)) {
    return { ok: false, error: 'That window is already covered by an existing ' + WORKER_CLASS_LABELS[workerClass] + ' shift.' }
  }

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

// ── Coverage blocks ──────────────────────────────────────────────────────────────
// Merge upcoming bookings that overlap or sit within a 1-hour gap into single
// coverage blocks, so one shift covers a natural stretch instead of leaving gaps.
const BLOCK_GAP_MS = 60 * 60 * 1000

export type BlockBooking = { start_time: string; end_time: string; set_name: string | null }
export type CoverageBlock = {
  key: string
  start_time: string
  end_time: string
  booking_count: number
  bookings: BlockBooking[]
  sets: string[]
  shift: StaffedShift | null   // an existing non-cancelled shift overlapping this block
}

export async function getCoverageBlocks(now = Date.now()): Promise<CoverageBlock[]> {
  const admin = supabaseAdmin()
  const nowIso = new Date(now).toISOString()
  const { data: bookings } = await admin.from('bookings')
    .select('start_time, end_time, sets(name)')
    .neq('status', 'cancelled').gte('end_time', nowIso)
    .order('start_time', { ascending: true }).limit(120)
  const rows = (bookings ?? []) as any[]
  if (!rows.length) return []

  type B = { start: number; end: number; bookings: BlockBooking[]; sets: Set<string> }
  const blocks: B[] = []
  for (const r of rows) {
    const start = new Date(r.start_time).getTime(), end = new Date(r.end_time).getTime()
    const setName = relName(r.sets)
    const bk: BlockBooking = { start_time: r.start_time, end_time: r.end_time, set_name: setName }
    const last = blocks[blocks.length - 1]
    if (last && start <= last.end + BLOCK_GAP_MS) {
      last.end = Math.max(last.end, end)
      last.bookings.push(bk)
      if (setName) last.sets.add(setName)
    } else {
      blocks.push({ start, end, bookings: [bk], sets: new Set(setName ? [setName] : []) })
    }
  }

  // Existing non-cancelled, still-relevant shifts (to show which blocks are staffed).
  const { data: shiftRows } = await admin.from('shifts')
    .select('id, worker_class, claimed_by, cancelled_at, starts_at, ends_at')
    .is('cancelled_at', null).gte('ends_at', nowIso)
  const shifts = (shiftRows ?? []) as any[]
  const claimerIds = [...new Set(shifts.map(s => s.claimed_by).filter(Boolean))] as string[]
  const nameById = new Map<string, string | null>()
  if (claimerIds.length) {
    const { data: ws } = await admin.from('worker_profiles').select('id, full_name, email').in('id', claimerIds)
    for (const w of (ws ?? []) as any[]) nameById.set(w.id, w.full_name || w.email || null)
  }

  return blocks.map(bl => {
    const sh = shifts.find(s => new Date(s.starts_at).getTime() < bl.end && new Date(s.ends_at).getTime() > bl.start)
    let shift: StaffedShift | null = null
    if (sh) {
      const state: StaffedShift['state'] = new Date(sh.ends_at).getTime() < now ? 'past' : sh.claimed_by ? 'claimed' : 'open'
      shift = { id: sh.id, worker_class: sh.worker_class, state, claimer_name: sh.claimed_by ? (nameById.get(sh.claimed_by) ?? null) : null }
    }
    return {
      key: new Date(bl.start).toISOString(),
      start_time: new Date(bl.start).toISOString(),
      end_time: new Date(bl.end).toISOString(),
      booking_count: bl.bookings.length,
      bookings: bl.bookings,
      sets: [...bl.sets],
      shift,
    }
  })
}

// Post an OPEN shift for a coverage window (blocks/manual). Overlap-guarded.
export async function createShiftForWindow(startsAt: string, endsAt: string, workerClass: WorkerClass, notes?: string): Promise<{ ok: boolean; error?: string; id?: string }> {
  const admin = supabaseAdmin()
  const s = new Date(startsAt), e = new Date(endsAt)
  if (isNaN(s.getTime()) || isNaN(e.getTime()) || e.getTime() <= s.getTime()) return { ok: false, error: 'Enter a valid window.' }
  if (await overlappingShiftExists(workerClass, s.toISOString(), e.toISOString())) {
    return { ok: false, error: 'That window is already covered by an existing ' + WORKER_CLASS_LABELS[workerClass] + ' shift.' }
  }
  const now = new Date().toISOString()
  const { data: ins, error } = await admin.from('shifts').insert({
    starts_at: s.toISOString(), ends_at: e.toISOString(),
    worker_class: workerClass, notes: (notes || '').trim(),
    created_at: now, updated_at: now,
  }).select('id').maybeSingle()
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: (ins as any)?.id }
}
