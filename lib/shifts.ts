import { supabaseAdmin } from '@/lib/supabase'
import {
  type WorkerClass, WORKER_CLASS_LABELS,
  getWorkerByAccount, getCurrentModules, requiredForClass, getProgressRows, isCertified,
} from '@/lib/onboarding'

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
  created_at: string
  updated_at: string
}

export type ShiftState = 'open' | 'claimed' | 'cancelled' | 'past'
export function shiftState(s: Shift, now = Date.now()): ShiftState {
  if (s.cancelled_at) return 'cancelled'
  if (new Date(s.ends_at).getTime() < now) return 'past'
  return s.claimed_by ? 'claimed' : 'open'
}

// A trimmed shift for worker-facing views (no internal ids beyond the shift's own).
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

// ── Admin board ────────────────────────────────────────────────────────────────
export type AdminShift = Shift & {
  label: string
  state: ShiftState
  claimer: { name: string | null; email: string | null } | null
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
  return rows.map(s => ({
    ...s,
    label: WORKER_CLASS_LABELS[s.worker_class],
    state: shiftState(s),
    claimer: s.claimed_by ? { name: byId.get(s.claimed_by)?.full_name ?? null, email: byId.get(s.claimed_by)?.email ?? null } : null,
  }))
}

// ── Worker view ────────────────────────────────────────────────────────────────
export type WorkerShiftView = {
  enrolled: boolean
  eligibility: { active: boolean; certified: boolean; worker_class: WorkerClass | null; label: string | null }
  open: PublicShift[]
  mine: PublicShift[]
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
  const nowIso = new Date().toISOString()

  const { data: mineRows } = await admin.from('shifts').select('*')
    .eq('claimed_by', worker.id).is('cancelled_at', null)
    .gte('ends_at', nowIso).order('starts_at', { ascending: true })

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
    mine: ((mineRows ?? []) as Shift[]).map(toPublic),
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

  const { error } = await admin.from('shifts')
    .update({ claimed_by: null, claimed_at: null, updated_at: new Date().toISOString() })
    .eq('id', shiftId).eq('claimed_by', worker.id)
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}
