import { supabaseAdmin } from '@/lib/supabase'
import { getWorkerByAccount } from '@/lib/onboarding'

// A clock-in later than this past the scheduled start counts as "late".
export const LATE_GRACE_MS = 10 * 60 * 1000

export type ReviewDirection = 'studio_to_worker' | 'worker_to_studio'
export type ShiftReview = { rating: number; note: string; created_at: string }

// ── Reliability ──────────────────────────────────────────────────────────────
// Blends attendance (did they show up for shifts they claimed) with the studio's
// average rating, lightly penalized for lateness. Not stored — always derived.
export type WorkerReliability = {
  score: number | null        // 0-100; null until there's any history
  rating_avg: number | null   // studio→worker average, 1-5
  rating_count: number
  obligations: number         // past claimed, non-cancelled shifts
  attended: number            // clocked in
  no_shows: number            // past + claimed but never clocked in
  late: number
  completed: number           // clocked out
}

type Acc = { obligations: number; attended: number; no_shows: number; late: number; completed: number; ratingSum: number; ratingCount: number }

export async function getReliabilityMap(now = Date.now()): Promise<Map<string, WorkerReliability>> {
  const admin = supabaseAdmin()
  const [{ data: shiftRows }, { data: reviewRows }] = await Promise.all([
    admin.from('shifts').select('claimed_by, starts_at, ends_at, cancelled_at, clock_in_at, clock_out_at'),
    admin.from('shift_reviews').select('worker_id, rating').eq('direction', 'studio_to_worker'),
  ])

  const acc = new Map<string, Acc>()
  const get = (id: string): Acc => {
    let a = acc.get(id)
    if (!a) { a = { obligations: 0, attended: 0, no_shows: 0, late: 0, completed: 0, ratingSum: 0, ratingCount: 0 }; acc.set(id, a) }
    return a
  }

  for (const s of (shiftRows ?? []) as any[]) {
    if (!s.claimed_by || s.cancelled_at) continue
    const started = new Date(s.starts_at).getTime()
    const isPast = new Date(s.ends_at).getTime() < now
    const a = get(s.claimed_by)
    if (s.clock_in_at) {
      a.obligations++; a.attended++
      if (new Date(s.clock_in_at).getTime() > started + LATE_GRACE_MS) a.late++
      if (s.clock_out_at) a.completed++
    } else if (isPast) {
      a.obligations++; a.no_shows++
    }
    // a future shift that isn't clocked in yet is not an obligation yet
  }

  for (const r of (reviewRows ?? []) as any[]) {
    if (!r.worker_id) continue
    const a = get(r.worker_id)
    a.ratingSum += r.rating; a.ratingCount++
  }

  const out = new Map<string, WorkerReliability>()
  for (const [id, a] of acc) {
    const rating_avg = a.ratingCount ? a.ratingSum / a.ratingCount : null
    let score: number | null = null
    if (a.obligations > 0 || a.ratingCount > 0) {
      const att = a.obligations > 0 ? a.attended / a.obligations : 1
      const rat = a.ratingCount > 0 ? (rating_avg as number) / 5 : att   // fall back to attendance when unrated
      const latePenalty = a.obligations > 0 ? (a.late / a.obligations) * 0.1 : 0
      score = Math.round(Math.max(0, Math.min(1, att * 0.6 + rat * 0.4 - latePenalty)) * 100)
    }
    out.set(id, {
      score,
      rating_avg: rating_avg != null ? Math.round(rating_avg * 10) / 10 : null,
      rating_count: a.ratingCount,
      obligations: a.obligations, attended: a.attended, no_shows: a.no_shows, late: a.late, completed: a.completed,
    })
  }
  return out
}

// ── Review reads (batched per direction, keyed by shift_id) ──────────────────────
export async function getShiftReviewMap(direction: ReviewDirection, shiftIds?: string[]): Promise<Map<string, ShiftReview>> {
  const admin = supabaseAdmin()
  let q = admin.from('shift_reviews').select('shift_id, rating, note, created_at').eq('direction', direction)
  if (shiftIds && shiftIds.length) q = q.in('shift_id', shiftIds)
  const { data } = await q
  const m = new Map<string, ShiftReview>()
  for (const r of (data ?? []) as any[]) m.set(r.shift_id, { rating: r.rating, note: r.note, created_at: r.created_at })
  return m
}

// ── Submit (upsert, one per shift+direction) ─────────────────────────────────────
type ReviewShift = { id: string; claimed_by: string | null; ends_at: string; clock_out_at: string | null; cancelled_at: string | null }

async function loadReviewShift(shiftId: string): Promise<ReviewShift | null> {
  const { data } = await supabaseAdmin().from('shifts')
    .select('id, claimed_by, ends_at, clock_out_at, cancelled_at').eq('id', shiftId).maybeSingle()
  return (data ?? null) as ReviewShift | null
}

// Reviewable once the work is done: clocked out, or the scheduled end has passed.
function isReviewable(s: ReviewShift, now = Date.now()): boolean {
  return !!s.clock_out_at || new Date(s.ends_at).getTime() < now
}

async function upsertReview(shiftId: string, workerId: string, direction: ReviewDirection, rating: number, note: string): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabaseAdmin().from('shift_reviews')
    .upsert({ shift_id: shiftId, worker_id: workerId, direction, rating, note: (note || '').slice(0, 500), updated_at: new Date().toISOString() },
            { onConflict: 'shift_id,direction' })
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

export async function submitStudioReview(shiftId: string, rating: number, note: string): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: 'Rating must be 1–5.' }
  const s = await loadReviewShift(shiftId)
  if (!s) return { ok: false, error: 'That shift no longer exists.' }
  if (!s.claimed_by) return { ok: false, error: 'No worker was assigned to that shift.' }
  if (!isReviewable(s)) return { ok: false, error: 'You can review a shift once it is finished.' }
  return upsertReview(shiftId, s.claimed_by, 'studio_to_worker', rating, note)
}

export async function submitWorkerReview(accountId: string, shiftId: string, rating: number, note: string): Promise<{ ok: boolean; error?: string }> {
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) return { ok: false, error: 'Rating must be 1–5.' }
  const worker = await getWorkerByAccount(accountId)
  if (!worker) return { ok: false, error: 'You have not applied to work yet.' }
  const s = await loadReviewShift(shiftId)
  if (!s) return { ok: false, error: 'That shift no longer exists.' }
  if (s.claimed_by !== worker.id) return { ok: false, error: 'That is not your shift.' }
  if (!isReviewable(s)) return { ok: false, error: 'You can rate a shift once it is finished.' }
  return upsertReview(shiftId, worker.id, 'worker_to_studio', rating, note)
}
