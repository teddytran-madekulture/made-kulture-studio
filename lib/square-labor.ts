import { Client, Environment } from 'square'
import { randomUUID } from 'crypto'
import { supabaseAdmin } from '@/lib/supabase'
import { WORKER_CLASSES, WORKER_CLASS_LABELS, type WorkerClass } from '@/lib/onboarding'

const LOCATION_ID = process.env.SQUARE_LOCATION_ID || ''

function client() {
  return new Client({
    accessToken: process.env.SQUARE_ACCESS_TOKEN!,
    environment: process.env.SQUARE_ENVIRONMENT === 'production' ? Environment.Production : Environment.Sandbox,
  })
}
export function squareConfigured(): boolean {
  return !!(process.env.SQUARE_ACCESS_TOKEN && LOCATION_ID)
}

function squareErr(e: any): string {
  const code = e?.statusCode
  const detail = e?.errors?.[0]?.detail || e?.message
  if (code === 403 || code === 401) return `Square denied access (${code}) — this access token is missing Team Management + Labor permissions. Re-authorize the Square token with those scopes.`
  return detail || 'Square request failed.'
}

// ── Per-class payroll toggles (studio_settings key/value) ────────────────────────
const KEY = (c: WorkerClass) => `payroll_enabled_${c}`
const DEFAULT_ON = (c: WorkerClass) => c === 'attendant' || c === 'sanitation'

export async function getPayrollClassEnabled(): Promise<Record<WorkerClass, boolean>> {
  const { data } = await supabaseAdmin().from('studio_settings').select('key, value').in('key', WORKER_CLASSES.map(KEY))
  const map = new Map(((data ?? []) as any[]).map(r => [r.key, r.value]))
  const out = {} as Record<WorkerClass, boolean>
  for (const c of WORKER_CLASSES) {
    const v = map.get(KEY(c))
    out[c] = v == null ? DEFAULT_ON(c) : v === 'true'
  }
  return out
}

export async function setPayrollClassEnabled(cls: WorkerClass, enabled: boolean): Promise<void> {
  const admin = supabaseAdmin()
  const key = KEY(cls), value = enabled ? 'true' : 'false'
  const { data: existing } = await admin.from('studio_settings').select('key').eq('key', key).maybeSingle()
  if (existing) await admin.from('studio_settings').update({ value }).eq('key', key)
  else await admin.from('studio_settings').insert({ key, value })
}

// ── Connection / scope test ──────────────────────────────────────────────────────
// A harmless read against Team + Labor to confirm the token actually carries those
// scopes in production (can't be checked any other way from outside Vercel).
export async function testSquareLabor(): Promise<{ ok: boolean; configured: boolean; team: boolean; labor: boolean; error?: string }> {
  if (!squareConfigured()) return { ok: false, configured: false, team: false, labor: false, error: 'Square is not configured (missing SQUARE_ACCESS_TOKEN or SQUARE_LOCATION_ID).' }
  const c = client()
  let team = false, labor = false, error: string | undefined
  try { await c.teamApi.searchTeamMembers({ query: { filter: { locationIds: [LOCATION_ID] } as any }, limit: 1 }); team = true }
  catch (e: any) { error = squareErr(e) }
  try { await c.laborApi.searchShifts({ query: { filter: { locationIds: [LOCATION_ID] } }, limit: 1 }); labor = true }
  catch (e: any) { error = error || squareErr(e) }
  const ok = team && labor
  return { ok, configured: true, team, labor, error: ok ? undefined : (error || 'Square rejected the Team/Labor request.') }
}

// ── Provision a worker as a Square Team member (idempotent) ──────────────────────
export async function provisionTeamMember(workerId: string): Promise<{ ok: boolean; teamMemberId?: string; error?: string }> {
  const admin = supabaseAdmin()
  const { data: w } = await admin.from('worker_profiles').select('*').eq('id', workerId).maybeSingle()
  if (!w) return { ok: false, error: 'Worker not found.' }
  const worker = w as any
  const enabled = await getPayrollClassEnabled()
  if (!enabled[worker.worker_class as WorkerClass]) return { ok: false, error: `Payroll is turned off for ${WORKER_CLASS_LABELS[worker.worker_class as WorkerClass]}s.` }
  if (worker.square_team_member_id) return { ok: true, teamMemberId: worker.square_team_member_id }
  if (!squareConfigured()) return { ok: false, error: 'Square is not configured.' }

  const parts = (worker.full_name || worker.email || 'Studio Worker').trim().split(/\s+/)
  const given = parts[0], family = parts.slice(1).join(' ')
  try {
    const res = await client().teamApi.createTeamMember({
      idempotencyKey: randomUUID(),
      teamMember: {
        givenName: given,
        familyName: family || undefined,
        emailAddress: worker.email || undefined,
        assignedLocations: { assignmentType: 'EXPLICIT_LOCATIONS' as any, locationIds: [LOCATION_ID] },
      },
    })
    const id = res.result.teamMember?.id
    if (!id) return { ok: false, error: 'Square did not return a team member id.' }
    await admin.from('worker_profiles').update({ square_team_member_id: id }).eq('id', workerId)
    return { ok: true, teamMemberId: id }
  } catch (e: any) { return { ok: false, error: squareErr(e) } }
}

// ── Push a completed shift's hours as a Square Labor timecard ─────────────────────
export async function pushTimecard(shiftId: string): Promise<{ ok: boolean; error?: string; timecardId?: string }> {
  const admin = supabaseAdmin()
  const { data: sh } = await admin.from('shifts').select('*').eq('id', shiftId).maybeSingle()
  if (!sh) return { ok: false, error: 'Shift not found.' }
  const shift = sh as any
  if (!shift.clock_in_at || !shift.clock_out_at) return { ok: false, error: 'That shift is not clocked out yet.' }
  if (shift.timecard_id) return { ok: true, timecardId: shift.timecard_id }
  if (!shift.claimed_by) return { ok: false, error: 'That shift has no worker.' }
  const enabled = await getPayrollClassEnabled()
  if (!enabled[shift.worker_class as WorkerClass]) return { ok: false, error: `Payroll is off for ${WORKER_CLASS_LABELS[shift.worker_class as WorkerClass]}s.` }

  const prov = await provisionTeamMember(shift.claimed_by)
  if (!prov.ok || !prov.teamMemberId) return { ok: false, error: prov.error || 'Could not provision the worker on Square.' }

  try {
    const res = await client().laborApi.createShift({
      idempotencyKey: randomUUID(),
      shift: {
        locationId: LOCATION_ID,
        teamMemberId: prov.teamMemberId,
        startAt: new Date(shift.clock_in_at).toISOString(),
        endAt: new Date(shift.clock_out_at).toISOString(),
      },
    })
    const tid = res.result.shift?.id
    await admin.from('shifts').update({ timecard_id: tid ?? 'synced', timecard_synced_at: new Date().toISOString() }).eq('id', shiftId)
    return { ok: true, timecardId: tid }
  } catch (e: any) { return { ok: false, error: squareErr(e) } }
}

// ── Payroll queue (completed shifts for payroll-enabled classes) ─────────────────
export type PayrollRow = {
  shift_id: string
  starts_at: string
  clock_in_at: string
  clock_out_at: string
  worked_minutes: number
  worker_id: string
  worker_name: string | null
  worker_class: WorkerClass
  worker_label: string
  provisioned: boolean
  synced_at: string | null
}

export async function getPayrollQueue(): Promise<PayrollRow[]> {
  const admin = supabaseAdmin()
  const enabled = await getPayrollClassEnabled()
  const classes = WORKER_CLASSES.filter(c => enabled[c])
  if (!classes.length) return []
  const { data: rows } = await admin.from('shifts')
    .select('id, starts_at, clock_in_at, clock_out_at, worker_class, claimed_by, timecard_synced_at')
    .not('clock_out_at', 'is', null).in('worker_class', classes)
    .order('clock_out_at', { ascending: false }).limit(100)
  const list = ((rows ?? []) as any[]).filter(r => r.claimed_by)
  const workerIds = [...new Set(list.map(r => r.claimed_by))] as string[]
  const wById = new Map<string, any>()
  if (workerIds.length) {
    const { data: ws } = await admin.from('worker_profiles').select('id, full_name, email, square_team_member_id').in('id', workerIds)
    for (const w of (ws ?? []) as any[]) wById.set(w.id, w)
  }
  return list.map(r => {
    const w = wById.get(r.claimed_by)
    return {
      shift_id: r.id, starts_at: r.starts_at, clock_in_at: r.clock_in_at, clock_out_at: r.clock_out_at,
      worked_minutes: Math.max(0, Math.round((new Date(r.clock_out_at).getTime() - new Date(r.clock_in_at).getTime()) / 60000)),
      worker_id: r.claimed_by, worker_name: w?.full_name || w?.email || null,
      worker_class: r.worker_class, worker_label: WORKER_CLASS_LABELS[r.worker_class as WorkerClass],
      provisioned: !!w?.square_team_member_id, synced_at: r.timecard_synced_at ?? null,
    }
  })
}

export async function getPayrollOverview() {
  const [settings, queue] = await Promise.all([getPayrollClassEnabled(), getPayrollQueue()])
  return { configured: squareConfigured(), settings, queue }
}
