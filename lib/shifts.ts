import { supabaseAdmin } from '@/lib/supabase'
import {
  type WorkerClass, WORKER_CLASS_LABELS,
  getWorkerByAccount, getCurrentModules, requiredForClass, getProgressRows, isCertified,
} from '@/lib/onboarding'
import { type ShiftReview, getShiftReviewMap } from '@/lib/reviews'

// ── Tunables ────────────────────────────────────────────────────────────────────
export const CLOCK_IN_LEAD_MS = 60 * 60 * 1000    // clock-in unlocks 1 hour before start
export const CLOCK_IN_TRAIL_MS = 60 * 60 * 1000   // and stays open until 1 hour after end
export const CLOSEOUT_PHOTO_MIN = 1              // photos required before clock-out
const SIGNED_URL_TTL = 60 * 60                    // 1h signed URL for private photos
const SHIFT_MEDIA_BUCKET = 'shift-media'

// ── Shift shape ────────────────────────────────────────────────────────────────
export type Shift = {
  id: string
  starts_at: string
  ends_at: string
  worker_class: WorkerClass
  notes: string
  claimed_by: string | null
  claimed_at: string | null
  cancelled_at: string | null
  clock_in_at: string | null
  clock_out_at: string | null
  clock_edited_at: string | null
  auto_clock_out: boolean
  booking_id: string | null
  created_at: string
  updated_at: string
}

export type ShiftState = 'open' | 'claimed' | 'cancelled' | 'past'
export function shiftState(s: Shift, now = Date.now()): ShiftState {
  if (s.cancelled_at) return 'cancelled'
  if (new Date(s.ends_at).getTime() < now) return 'past'
  return s.claimed_by ? 'claimed' : 'open'
}

// ── Closeout photos ──────────────────────────────────────────────────────────────
export type ShiftPhotoRow = { id: string; shift_id: string; worker_id: string | null; storage_path: string; caption: string; created_at: string }
export type ShiftPhoto = { id: string; url: string; caption: string; created_at: string }

async function signPhotos(rows: ShiftPhotoRow[]): Promise<ShiftPhoto[]> {
  const admin = supabaseAdmin()
  const out: ShiftPhoto[] = []
  for (const r of rows) {
    const { data } = await admin.storage.from(SHIFT_MEDIA_BUCKET).createSignedUrl(r.storage_path, SIGNED_URL_TTL)
    out.push({ id: r.id, url: data?.signedUrl ?? '', caption: r.caption, created_at: r.created_at })
  }
  return out
}

async function photosForShift(shiftId: string): Promise<ShiftPhotoRow[]> {
  const { data } = await supabaseAdmin()
    .from('shift_photos').select('*').eq('shift_id', shiftId).order('created_at', { ascending: true })
  return (data ?? []) as ShiftPhotoRow[]
}

// ── Worker-facing trimmed shift ──────────────────────────────────────────────────
export type PublicShift = {
  id: string
  starts_at: string
  ends_at: string
  worker_class: WorkerClass
  label: string
  notes: string
}
function toPublic(s: Shift): PublicShift {
  return { id: s.id, starts_at: s.starts_at, ends_at: s.ends_at, worker_class: s.worker_class, label: WORKER_CLASS_LABELS[s.worker_class], notes: s.notes }
}

// A claimed shift with clock + photo detail, for the worker's own list.
export type ShiftPhase = 'upcoming' | 'clock_in_open' | 'working' | 'done' | 'missed'
export type DoorCode = { start_time: string; end_time: string; set_name: string | null; front: string | null; back: string | null }
export type MyShift = PublicShift & {
  clock_in_at: string | null
  clock_out_at: string | null
  can_clock_in: boolean
  phase: ShiftPhase
  photo_min: number
  photos: ShiftPhoto[]
  can_review: boolean            // shift is done → worker may rate the studio
  worker_review: ShiftReview | null
  door_codes: DoorCode[]         // codes for every booking overlapping this shift's window
  booking_linked: boolean        // shift overlaps >=1 booking (missing codes = "coming", not "n/a")
  itinerary: { start_time: string; end_time: string; set_name: string | null }[]  // bookings during the shift
  has_next: boolean              // worker holds an adjacent next shift (clock-out hands off)
}

function shiftPhase(s: Shift, active: boolean, now: number): { phase: ShiftPhase; can_clock_in: boolean } {
  if (s.clock_out_at) return { phase: 'done', can_clock_in: false }
  if (s.clock_in_at) return { phase: 'working', can_clock_in: false }
  const start = new Date(s.starts_at).getTime()
  const end = new Date(s.ends_at).getTime()
  const inWindow = now >= start - CLOCK_IN_LEAD_MS && now <= end + CLOCK_IN_TRAIL_MS
  if (inWindow) return { phase: 'clock_in_open', can_clock_in: active }
  if (now > end + CLOCK_IN_TRAIL_MS) return { phase: 'missed', can_clock_in: false }
  return { phase: 'upcoming', can_clock_in: false }
}

async function toMyShift(s: Shift, active: boolean, now: number, review: ShiftReview | null, info: { codes: DoorCode[]; itinerary: { start_time: string; end_time: string; set_name: string | null }[]; hasBooking: boolean; hasNext: boolean }): Promise<MyShift> {
  const { phase, can_clock_in } = shiftPhase(s, active, now)
  const photos = await signPhotos(await photosForShift(s.id))
  return {
    ...toPublic(s),
    clock_in_at: s.clock_in_at, clock_out_at: s.clock_out_at,
    can_clock_in, phase, photo_min: CLOSEOUT_PHOTO_MIN, photos,
    can_review: phase === 'done', worker_review: review,
    door_codes: info.codes, booking_linked: info.hasBooking, itinerary: info.itinerary, has_next: info.hasNext,
  }
}

// ── Admin board ────────────────────────────────────────────────────────────────
export type AdminShift = Shift & {
  label: string
  state: ShiftState
  claimer: { name: string | null; email: string | null } | null
  worked_minutes: number | null
  photos: ShiftPhoto[]
  studio_review: ShiftReview | null
}

export async function getShiftsAdmin(): Promise<AdminShift[]> {
  const admin = supabaseAdmin()
  const { data } = await admin.from('shifts').select('*').order('starts_at', { ascending: true })
  const rows = (data ?? []) as Shift[]

  const ids = [...new Set(rows.map(r => r.claimed_by).filter(Boolean))] as string[]
  const byId = new Map<string, { full_name: string | null; email: string | null }>()
  if (ids.length) {
    const { data: workers } = await admin.from('worker_profiles').select('id, full_name, email').in('id', ids)
    for (const w of (workers ?? []) as any[]) byId.set(w.id, { full_name: w.full_name, email: w.email })
  }

  const reviewMap = await getShiftReviewMap('studio_to_worker', rows.map(r => r.id))

  const out: AdminShift[] = []
  for (const s of rows) {
    const photos = s.claimed_by ? await signPhotos(await photosForShift(s.id)) : []
    const worked = s.clock_in_at && s.clock_out_at
      ? Math.max(0, Math.round((new Date(s.clock_out_at).getTime() - new Date(s.clock_in_at).getTime()) / 60000))
      : null
    out.push({
      ...s,
      label: WORKER_CLASS_LABELS[s.worker_class],
      state: shiftState(s),
      claimer: s.claimed_by ? { name: byId.get(s.claimed_by)?.full_name ?? null, email: byId.get(s.claimed_by)?.email ?? null } : null,
      worked_minutes: worked,
      photos,
      studio_review: reviewMap.get(s.id) ?? null,
    })
  }
  return out
}

// ── Worker view ────────────────────────────────────────────────────────────────
export type WorkerShiftView = {
  enrolled: boolean
  eligibility: { active: boolean; certified: boolean; worker_class: WorkerClass | null; label: string | null }
  open: PublicShift[]
  mine: MyShift[]
}

export async function getWorkerShiftView(accountId: string): Promise<WorkerShiftView> {
  const worker = await getWorkerByAccount(accountId)
  if (!worker) {
    return { enrolled: false, eligibility: { active: false, certified: false, worker_class: null, label: null }, open: [], mine: [] }
  }
  const modules = await getCurrentModules()
  const required = requiredForClass(modules, worker.worker_class)
  const progress = await getProgressRows(worker.id)
  const certified = isCertified(required, progress)
  const active = worker.status === 'active'

  const admin = supabaseAdmin()
  const now = Date.now()
  const nowIso = new Date(now).toISOString()
  // Keep a claimed shift on the worker's list from claim until ~12h after it ends,
  // so an in-progress or just-finished shift stays visible to clock out / confirm.
  const floorIso = new Date(now - 12 * 60 * 60 * 1000).toISOString()

  const { data: mineRows } = await admin.from('shifts').select('*')
    .eq('claimed_by', worker.id).is('cancelled_at', null)
    .gte('ends_at', floorIso).order('starts_at', { ascending: true })
  const mineShifts = (mineRows ?? []) as Shift[]
  const wReviews = await getShiftReviewMap('worker_to_studio', mineShifts.map(s => s.id))
  // Door codes = every non-cancelled booking overlapping a shift's window (a block
  // shift can span several bookings, each with its own per-booking code).
  let bkRows: any[] = []
  if (mineShifts.length) {
    let minS = Infinity, maxE = -Infinity
    for (const s of mineShifts) { minS = Math.min(minS, new Date(s.starts_at).getTime()); maxE = Math.max(maxE, new Date(s.ends_at).getTime()) }
    const { data: bks } = await admin.from('bookings')
      .select('start_time, end_time, door_code, door_code_back, sets(name)')
      .neq('status', 'cancelled')
      .lt('start_time', new Date(maxE).toISOString()).gt('end_time', new Date(minS).toISOString())
      .order('start_time', { ascending: true })
    bkRows = (bks ?? []) as any[]
  }
  const overlapFor = (s: Shift) => {
    const a = new Date(s.starts_at).getTime(), b = new Date(s.ends_at).getTime()
    const over = bkRows.filter(x => new Date(x.start_time).getTime() < b && new Date(x.end_time).getTime() > a)
    const codes: DoorCode[] = []
    const itinerary: { start_time: string; end_time: string; set_name: string | null }[] = []
    for (const x of over) {
      const setName = Array.isArray(x.sets) ? (x.sets[0]?.name ?? null) : (x.sets?.name ?? null)
      itinerary.push({ start_time: x.start_time, end_time: x.end_time, set_name: setName })
      if (x.door_code || x.door_code_back) codes.push({ start_time: x.start_time, end_time: x.end_time, set_name: setName, front: x.door_code ?? null, back: x.door_code_back ?? null })
    }
    const endMs = b
    const hasNext = mineShifts.some(o => o.id !== s.id && !o.clock_in_at && !o.clock_out_at && !o.cancelled_at
      && new Date(o.starts_at).getTime() >= endMs - 15 * 60 * 1000
      && new Date(o.starts_at).getTime() <= endMs + 60 * 60 * 1000)
    return { codes, itinerary, hasBooking: over.length > 0, hasNext }
  }
  const mine: MyShift[] = []
  for (const s of mineShifts) {
    mine.push(await toMyShift(s, active, now, wReviews.get(s.id) ?? null, overlapFor(s)))
  }

  let openRows: Shift[] = []
  if (active && certified) {
    const { data } = await admin.from('shifts').select('*')
      .eq('worker_class', worker.worker_class).is('claimed_by', null).is('cancelled_at', null)
      .gte('starts_at', nowIso).order('starts_at', { ascending: true })
    openRows = (data ?? []) as Shift[]
  }

  return {
    enrolled: true,
    eligibility: { active, certified, worker_class: worker.worker_class, label: WORKER_CLASS_LABELS[worker.worker_class] },
    open: openRows.map(toPublic),
    mine,
  }
}

// ── Claim / drop (race-safe via conditional update) ────────────────────────────
export async function claimShift(accountId: string, shiftId: string): Promise<{ ok: boolean; error?: string }> {
  const worker = await getWorkerByAccount(accountId)
  if (!worker) return { ok: false, error: 'You have not applied to work yet.' }
  if (worker.status !== 'active') return { ok: false, error: 'Your worker account is not active yet.' }

  const modules = await getCurrentModules()
  const required = requiredForClass(modules, worker.worker_class)
  const progress = await getProgressRows(worker.id)
  if (!isCertified(required, progress)) return { ok: false, error: 'Finish your orientation modules before claiming shifts.' }

  const admin = supabaseAdmin()
  const { data: shiftRow } = await admin.from('shifts').select('*').eq('id', shiftId).maybeSingle()
  if (!shiftRow) return { ok: false, error: 'That shift no longer exists.' }
  const s = shiftRow as Shift
  if (s.cancelled_at) return { ok: false, error: 'That shift was cancelled.' }
  if (s.claimed_by) return { ok: false, error: 'Someone already claimed that shift.' }
  if (s.worker_class !== worker.worker_class) return { ok: false, error: 'That shift is for a different role.' }
  if (new Date(s.starts_at).getTime() < Date.now()) return { ok: false, error: 'That shift has already started.' }

  // Conditional update: only claims if STILL open — prevents two workers racing.
  const { data: updated, error } = await admin.from('shifts')
    .update({ claimed_by: worker.id, claimed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', shiftId).is('claimed_by', null).is('cancelled_at', null)
    .select('id')
  if (error) return { ok: false, error: error.message }
  if (!updated || updated.length === 0) return { ok: false, error: 'Someone just claimed that shift.' }
  return { ok: true }
}

export async function dropShift(accountId: string, shiftId: string): Promise<{ ok: boolean; error?: string }> {
  const worker = await getWorkerByAccount(accountId)
  if (!worker) return { ok: false, error: 'You have not applied to work yet.' }

  const admin = supabaseAdmin()
  const { data: shiftRow } = await admin.from('shifts').select('*').eq('id', shiftId).maybeSingle()
  if (!shiftRow) return { ok: false, error: 'That shift no longer exists.' }
  const s = shiftRow as Shift
  if (s.claimed_by !== worker.id) return { ok: false, error: 'That is not your shift.' }
  if (s.clock_in_at) return { ok: false, error: 'You are already clocked in — you cannot drop this shift.' }

  const { error } = await admin.from('shifts')
    .update({ claimed_by: null, claimed_at: null, updated_at: new Date().toISOString() })
    .eq('id', shiftId).eq('claimed_by', worker.id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ── Clock in / out ───────────────────────────────────────────────────────────────
// Load a shift and confirm the signed-in account is the worker who claimed it.
async function loadOwnedShift(accountId: string, shiftId: string): Promise<{ worker: any; shift: Shift } | { error: string }> {
  const worker = await getWorkerByAccount(accountId)
  if (!worker) return { error: 'You have not applied to work yet.' }
  const { data: shiftRow } = await supabaseAdmin().from('shifts').select('*').eq('id', shiftId).maybeSingle()
  if (!shiftRow) return { error: 'That shift no longer exists.' }
  const shift = shiftRow as Shift
  if (shift.claimed_by !== worker.id) return { error: 'That is not your shift.' }
  return { worker, shift }
}

export async function clockIn(accountId: string, shiftId: string): Promise<{ ok: boolean; error?: string }> {
  const r = await loadOwnedShift(accountId, shiftId)
  if ('error' in r) return { ok: false, error: r.error }
  const { worker, shift } = r
  if (worker.status !== 'active') return { ok: false, error: 'Your worker account is not active.' }
  if (shift.cancelled_at) return { ok: false, error: 'That shift was cancelled.' }
  if (shift.clock_out_at) return { ok: false, error: 'This shift is already clocked out.' }
  if (shift.clock_in_at) return { ok: false, error: 'You are already clocked in.' }
  const now = Date.now()
  const start = new Date(shift.starts_at).getTime()
  const end = new Date(shift.ends_at).getTime()
  if (now < start - CLOCK_IN_LEAD_MS) return { ok: false, error: 'Too early — clock-in opens 1 hour before your start time.' }
  if (now > end + CLOCK_IN_TRAIL_MS) return { ok: false, error: 'This shift ended over an hour ago. Ask the studio to sort out the hours.' }

  const { error } = await supabaseAdmin().from('shifts')
    .update({ clock_in_at: new Date(now).toISOString(), updated_at: new Date(now).toISOString() })
    .eq('id', shiftId).eq('claimed_by', worker.id).is('clock_in_at', null)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// A worker's next back-to-back shift: same worker, not started, starting from just
// before this one ends through up to an hour after (bridging a cleanup gap).
export const ADJ_BEFORE_MS = 15 * 60 * 1000
export const ADJ_AFTER_MS = 60 * 60 * 1000
async function findAdjacentNextShift(workerId: string, shift: Shift): Promise<Shift | null> {
  const end = new Date(shift.ends_at).getTime()
  const { data } = await supabaseAdmin().from('shifts').select('*')
    .eq('claimed_by', workerId).is('cancelled_at', null).is('clock_out_at', null).is('clock_in_at', null).neq('id', shift.id)
    .gte('starts_at', new Date(end - ADJ_BEFORE_MS).toISOString())
    .lte('starts_at', new Date(end + ADJ_AFTER_MS).toISOString())
    .order('starts_at', { ascending: true }).limit(1)
  return ((data ?? []) as Shift[])[0] ?? null
}

export async function clockOut(accountId: string, shiftId: string): Promise<{ ok: boolean; error?: string; handoff?: boolean }> {
  const r = await loadOwnedShift(accountId, shiftId)
  if ('error' in r) return { ok: false, error: r.error }
  const { worker, shift } = r
  if (!shift.clock_in_at) return { ok: false, error: 'You need to clock in first.' }
  if (shift.clock_out_at) return { ok: false, error: 'You already clocked out.' }

  const admin = supabaseAdmin()
  const now = new Date().toISOString()

  // Handoff: a claimed back-to-back shift they haven't started → flow straight into
  // it (no closeout photos mid-run, no re-punch). Photos happen at the true end.
  const next = await findAdjacentNextShift(worker.id, shift)
  if (next) {
    const { error: e1 } = await admin.from('shifts').update({ clock_out_at: now, updated_at: now })
      .eq('id', shiftId).eq('claimed_by', worker.id).not('clock_in_at', 'is', null).is('clock_out_at', null)
    if (e1) return { ok: false, error: e1.message }
    await admin.from('shifts').update({ clock_in_at: now, updated_at: now })
      .eq('id', next.id).eq('claimed_by', worker.id).is('clock_in_at', null).is('clock_out_at', null)
    return { ok: true, handoff: true }
  }

  // Final clock-out — closeout photos required.
  const { count } = await admin.from('shift_photos').select('id', { count: 'exact', head: true }).eq('shift_id', shiftId)
  if ((count ?? 0) < CLOSEOUT_PHOTO_MIN) {
    return { ok: false, error: `Add at least ${CLOSEOUT_PHOTO_MIN} closeout photo${CLOSEOUT_PHOTO_MIN === 1 ? '' : 's'} before clocking out.` }
  }
  const { error } = await admin.from('shifts').update({ clock_out_at: now, updated_at: now })
    .eq('id', shiftId).eq('claimed_by', worker.id).not('clock_in_at', 'is', null).is('clock_out_at', null)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ── Closeout photo record / delete (upload itself lives in the API route) ────────
// Returns the worker_id to attribute the photo to, after checking the caller may
// add photos to this shift (owns it, clocked in, not yet clocked out).
export async function assertCanAddPhoto(accountId: string, shiftId: string): Promise<{ ok: boolean; workerId?: string; error?: string }> {
  const r = await loadOwnedShift(accountId, shiftId)
  if ('error' in r) return { ok: false, error: r.error }
  const { worker, shift } = r
  if (!shift.clock_in_at) return { ok: false, error: 'Clock in before adding closeout photos.' }
  if (shift.clock_out_at) return { ok: false, error: 'This shift is already clocked out.' }
  return { ok: true, workerId: worker.id }
}

export async function recordShiftPhoto(shiftId: string, workerId: string, storagePath: string, caption: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabaseAdmin().from('shift_photos')
    .insert({ shift_id: shiftId, worker_id: workerId, storage_path: storagePath, caption: caption.slice(0, 200) })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function deleteShiftPhoto(accountId: string, shiftId: string, photoId: string): Promise<{ ok: boolean; error?: string }> {
  const r = await loadOwnedShift(accountId, shiftId)
  if ('error' in r) return { ok: false, error: r.error }
  const { shift } = r
  if (shift.clock_out_at) return { ok: false, error: 'This shift is already clocked out — photos are locked.' }

  const admin = supabaseAdmin()
  const { data: row } = await admin.from('shift_photos').select('*').eq('id', photoId).eq('shift_id', shiftId).maybeSingle()
  if (!row) return { ok: false, error: 'That photo no longer exists.' }
  const p = row as ShiftPhotoRow
  await admin.storage.from(SHIFT_MEDIA_BUCKET).remove([p.storage_path])
  const { error } = await admin.from('shift_photos').delete().eq('id', photoId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// True if a non-cancelled shift of the SAME role already overlaps this window —
// so a time block can only have one shift per role (one owner per window).
export async function overlappingShiftExists(workerClass: WorkerClass, startsAt: string, endsAt: string, excludeId?: string): Promise<boolean> {
  const a = new Date(startsAt).getTime(), b = new Date(endsAt).getTime()
  const { data } = await supabaseAdmin().from('shifts').select('id, starts_at, ends_at')
    .eq('worker_class', workerClass).is('cancelled_at', null)
  return ((data ?? []) as any[]).some(x => x.id !== excludeId && new Date(x.starts_at).getTime() < b && new Date(x.ends_at).getTime() > a)
}

export { SHIFT_MEDIA_BUCKET }


// ── Admin clock corrections + forgot-to-punch handling ───────────────────────────
// Set or fix a shift's clock in/out. undefined = leave as-is, null = clear, string
// (ISO) = set. Stamps clock_edited_at and clears any auto-close review flag.
export async function adminSetClock(shiftId: string, clockIn: string | null | undefined, clockOut: string | null | undefined): Promise<{ ok: boolean; error?: string }> {
  const admin = supabaseAdmin()
  const { data: sh } = await admin.from('shifts').select('*').eq('id', shiftId).maybeSingle()
  if (!sh) return { ok: false, error: 'That shift no longer exists.' }
  const s = sh as Shift
  if (!s.claimed_by) return { ok: false, error: 'No worker is assigned to that shift.' }

  const nextIn = clockIn === undefined ? s.clock_in_at : clockIn
  const nextOut = clockOut === undefined ? s.clock_out_at : clockOut
  if (nextIn && isNaN(new Date(nextIn).getTime())) return { ok: false, error: 'Invalid clock-in time.' }
  if (nextOut && isNaN(new Date(nextOut).getTime())) return { ok: false, error: 'Invalid clock-out time.' }
  if (nextOut && !nextIn) return { ok: false, error: 'Set a clock-in time before a clock-out time.' }
  if (nextIn && nextOut && new Date(nextIn).getTime() >= new Date(nextOut).getTime()) {
    return { ok: false, error: 'Clock-out has to be after clock-in.' }
  }

  const now = new Date().toISOString()
  const { error } = await admin.from('shifts')
    .update({ clock_in_at: nextIn, clock_out_at: nextOut, clock_edited_at: now, auto_clock_out: false, updated_at: now })
    .eq('id', shiftId)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// Nightly sweep: close shifts a worker clocked into but never out of, once the shift
// has been over for `graceMs`. Caps clock-out at the scheduled end and flags
// auto_clock_out so the studio reviews (and can bump it up if they stayed later).
export async function autoCloseStaleShifts(now = Date.now(), graceMs = 60 * 60 * 1000): Promise<number> {
  const admin = supabaseAdmin()
  const cutoff = new Date(now - graceMs).toISOString()
  const { data } = await admin.from('shifts').select('id, ends_at')
    .not('clock_in_at', 'is', null).is('clock_out_at', null).is('cancelled_at', null)
    .lt('ends_at', cutoff)
  const rows = (data ?? []) as { id: string; ends_at: string }[]
  let closed = 0
  for (const r of rows) {
    const { error } = await admin.from('shifts')
      .update({ clock_out_at: r.ends_at, auto_clock_out: true, updated_at: new Date(now).toISOString() })
      .eq('id', r.id).is('clock_out_at', null)
    if (!error) closed++
  }
  return closed
}
