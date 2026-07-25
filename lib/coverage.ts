// Coverage drift — does a shift still match the bookings it was posted to cover?
//
// A shift snapshots a booking window at post time. Bookings then move underneath
// it: extensions push the end out, admins reschedule or swap sets, guests cancel.
// Nothing used to notice, so a closed-out shift could look complete while the
// reality it covered had changed. Everything here is DERIVED at read time — no
// extra columns, no flags to keep in sync, nothing to backfill.

import { supabaseAdmin } from '@/lib/supabase'
import { sendOwnerPush } from '@/lib/push'

const TOL_MS = 60 * 1000               // timestamp wobble we ignore
const CHAIN_GRACE_MS = 15 * 60 * 1000  // a following shift still counts as continuous coverage if it starts within this
const STALE_MS = 12 * 60 * 60 * 1000   // stop flagging gaps this far in the past

export type CoverageIssueKind =
  | 'booking_cancelled'  // the booking this shift was posted for is gone or cancelled
  | 'window_moved'       // that booking's window no longer matches the shift's
  | 'uncovered_tail'     // a booking in this window now runs past the end of coverage
  | 'unlogged_set'       // closed out, but a set now in the window has no closeout photo

export type CoverageIssue = {
  kind: CoverageIssueKind
  message: string
  gap_start?: string     // uncovered_tail: the window that still needs staffing
  gap_end?: string
}

export type ShiftDrift = {
  post_closeout: boolean // the change landed after the worker already closed out
  issues: CoverageIssue[]
}

export type ShiftLike = {
  id: string
  starts_at: string
  ends_at: string
  worker_class: string
  booking_id: string | null
  cancelled_at: string | null
  clock_out_at: string | null
}

type BookingLike = { id: string; start_time: string; end_time: string; status: string; set_name: string | null }

const ms = (iso: string) => new Date(iso).getTime()

function relName(rel: any): string | null {
  if (!rel) return null
  return Array.isArray(rel) ? (rel[0]?.name ?? null) : (rel.name ?? null)
}

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}

// How far continuous coverage reaches past `fromMs`, hopping through shifts that
// pick up where the last one left off (a 15-min cleanup gap still counts as
// continuous). Pass a worker class to only chain shifts of that role.
function coverageReach(shifts: ShiftLike[], workerClass: string | null, fromMs: number): number {
  let reach = fromMs
  const used = new Set<string>()
  for (let guard = 0; guard < shifts.length + 1; guard++) {
    let moved = false
    for (const s of shifts) {
      if (used.has(s.id) || s.cancelled_at) continue
      if (workerClass && s.worker_class !== workerClass) continue
      const st = ms(s.starts_at), en = ms(s.ends_at)
      if (st <= reach + CHAIN_GRACE_MS && en > reach) { reach = en; used.add(s.id); moved = true }
    }
    if (!moved) break
  }
  return reach
}

// Per-shift drift for the admin board. `captionsByShift` = the closeout-photo
// captions already loaded for each shift (each caption is a set name), used to
// spot a set that entered the window after closeout.
export async function getShiftDriftMap(
  shifts: ShiftLike[],
  captionsByShift?: Map<string, Set<string>>,
  now = Date.now(),
): Promise<Map<string, ShiftDrift>> {
  const out = new Map<string, ShiftDrift>()
  const live = shifts.filter(s => !s.cancelled_at)
  if (!live.length) return out

  const admin = supabaseAdmin()
  let minMs = Infinity, maxMs = -Infinity
  for (const s of live) { minMs = Math.min(minMs, ms(s.starts_at)); maxMs = Math.max(maxMs, ms(s.ends_at)) }

  // Everything that could overlap a shift, plus a day of slack either side so a
  // booking that grew or moved out of its original window still comes back.
  const DAY = 24 * 3600 * 1000
  const { data: bkRows } = await admin.from('bookings')
    .select('id, start_time, end_time, status, sets(name)')
    .lt('start_time', new Date(maxMs + DAY).toISOString())
    .gt('end_time', new Date(minMs - DAY).toISOString())
  const bookings: BookingLike[] = ((bkRows ?? []) as any[]).map(b => ({
    id: b.id, start_time: b.start_time, end_time: b.end_time, status: b.status, set_name: relName(b.sets),
  }))
  const byId = new Map(bookings.map(b => [b.id, b]))

  // A linked booking can be moved clean out of that range — fetch those by id.
  const missingIds = [...new Set(live.map(s => s.booking_id).filter((id): id is string => !!id))].filter(id => !byId.has(id))
  if (missingIds.length) {
    const { data: extra } = await admin.from('bookings')
      .select('id, start_time, end_time, status, sets(name)').in('id', missingIds)
    for (const b of (extra ?? []) as any[]) {
      const row: BookingLike = { id: b.id, start_time: b.start_time, end_time: b.end_time, status: b.status, set_name: relName(b.sets) }
      bookings.push(row); byId.set(row.id, row)
    }
  }
  const liveBookings = bookings.filter(b => b.status !== 'cancelled')

  for (const s of live) {
    const issues: CoverageIssue[] = []
    const sStart = ms(s.starts_at), sEnd = ms(s.ends_at)

    // 1 · the specific booking this shift was posted for
    if (s.booking_id) {
      const b = byId.get(s.booking_id)
      if (!b) {
        issues.push({ kind: 'booking_cancelled', message: 'The booking this shift was posted for no longer exists.' })
      } else if (b.status === 'cancelled') {
        issues.push({ kind: 'booking_cancelled', message: `The ${b.set_name ? b.set_name + ' ' : ''}booking this shift covers was cancelled.` })
      } else if (Math.abs(ms(b.start_time) - sStart) > TOL_MS || Math.abs(ms(b.end_time) - sEnd) > TOL_MS) {
        issues.push({
          kind: 'window_moved',
          message: `The booking moved — it now runs ${timeLabel(b.start_time)} – ${timeLabel(b.end_time)}, but this shift is still posted for ${timeLabel(s.starts_at)} – ${timeLabel(s.ends_at)}.`,
        })
      }
    }

    // 2 · a booking in this window now runs past where coverage stops. Only the
    // LAST shift in a chain reports it, so a split block warns once, not twice.
    const overlapping = liveBookings.filter(b => ms(b.start_time) < sEnd && ms(b.end_time) > sStart)
    if (overlapping.length) {
      const latest = Math.max(...overlapping.map(b => ms(b.end_time)))
      const reach = coverageReach(live, s.worker_class, sEnd)
      if (reach <= sEnd + TOL_MS && latest > sEnd + TOL_MS && latest > now - STALE_MS) {
        const runner = overlapping.find(b => ms(b.end_time) === latest)
        const gapEndIso = new Date(latest).toISOString()
        issues.push({
          kind: 'uncovered_tail',
          message: `${runner?.set_name ?? 'A booking'} now runs to ${timeLabel(gapEndIso)}, past the end of this shift — ${Math.round((latest - sEnd) / 60000)} min unstaffed.`,
          gap_start: new Date(sEnd).toISOString(),
          gap_end: gapEndIso,
        })
      }
    }

    // 3 · closed out, but a set now in the window never got a closeout photo.
    // Only meaningful on the shift that actually took photos (a handed-off
    // predecessor has none by design — the run's photos live on the last shift).
    if (s.clock_out_at && captionsByShift) {
      const caps = captionsByShift.get(s.id) ?? new Set<string>()
      if (caps.size > 0) {
        const names = [...new Set(overlapping.map(b => b.set_name).filter((n): n is string => !!n))]
        const missing = names.filter(n => !caps.has(n))
        if (missing.length) {
          issues.push({
            kind: 'unlogged_set',
            message: `Closed out with no photo of ${missing.join(', ')} — the bookings in this window changed after closeout.`,
          })
        }
      }
    }

    if (issues.length) out.set(s.id, { post_closeout: !!s.clock_out_at, issues })
  }
  return out
}

// Fired right after a booking's end time moves out (staff add-time, self-serve
// extension, admin reschedule). Pings Teddy only when a shift was actually
// covering the session and nothing covers the new tail — a staffing gap, not a
// photo problem. Same tag per booking, so repeat extensions replace rather than
// stack. Non-fatal by design; every caller fires and forgets.
export async function notifyCoverageGap(bookingId: string): Promise<void> {
  try {
    const admin = supabaseAdmin()
    const { data: bk } = await admin.from('bookings')
      .select('id, start_time, end_time, status, sets(name)').eq('id', bookingId).maybeSingle()
    if (!bk || (bk as any).status === 'cancelled') return
    const b = bk as any
    const setName = relName(b.sets) ?? 'The booking'
    const bStart = ms(b.start_time), bEnd = ms(b.end_time)

    const { data: sRows } = await admin.from('shifts')
      .select('id, starts_at, ends_at, worker_class, booking_id, cancelled_at, clock_out_at, claimed_by')
      .is('cancelled_at', null)
      .lt('starts_at', new Date(bEnd).toISOString())
      .gt('ends_at', new Date(bStart).toISOString())
    const rows = (sRows ?? []) as any[]
    if (!rows.length) return   // nobody was covering this session anyway

    const shifts: ShiftLike[] = rows.map(s => ({
      id: s.id, starts_at: s.starts_at, ends_at: s.ends_at, worker_class: s.worker_class,
      booking_id: s.booking_id, cancelled_at: s.cancelled_at, clock_out_at: s.clock_out_at,
    }))
    const reach = coverageReach(shifts, null, bStart)
    if (reach >= bEnd - TOL_MS) return   // coverage already runs to the new end

    // Whose shift ends where coverage stops — worth naming in the alert.
    const last = rows.find(s => Math.abs(ms(s.ends_at) - reach) <= TOL_MS)
    let who = ''
    if (last?.claimed_by) {
      const { data: w } = await admin.from('worker_profiles').select('full_name, email').eq('id', last.claimed_by).maybeSingle()
      const name = (w as any)?.full_name || (w as any)?.email
      if (name) who = ` ${name}'s`
    }

    const mins = Math.round((bEnd - reach) / 60000)
    await sendOwnerPush({
      title: '⚠️ Coverage gap',
      body: `${setName} now runs to ${timeLabel(b.end_time)} but${who} coverage ends at ${timeLabel(new Date(reach).toISOString())} — ${mins} min unstaffed.`,
      url: '/admin/shifts',
      tag: `coverage-gap-${bookingId}`,
      renotify: true,
    })
  } catch (e) {
    console.error('[coverage] gap check error (non-fatal):', e)
  }
}
