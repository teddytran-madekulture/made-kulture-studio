// Account standing — CALCULATED from customer_incidents, never stored.
// Plan: MK_Account_Standing_Plan_2026-09-27.docx. Migration 109.
//
// Same idea as ATLAS room status: one pure function derives the answer from the
// record, so nothing can drift and a threshold edited in admin takes effect on
// the next request. Every door (checkout, short-notice, cancel, reschedule,
// manage link, rewards payout) asks THIS file — never re-implement the rule.
//
// ⚠️ Dependency-free on purpose (callers pass their own supabase client) so the
// client-side admin dashboard can import the labels and colours too.

export type Severity = 'minor' | 'moderate' | 'serious' | 'critical'
export type StandingLevel = 'good' | 'warning' | 'probation' | 'suspended'

export interface StandingConfig {
  points: Record<Severity, number>
  thresholds: { warning: number; probation: number; suspended: number }
  expiryMonths: number                 // points drop off after this; critical never does
  emailFrom: Severity                  // default "email the customer" from this severity up
  categories: { key: string; label: string; severity: Severity }[]
}

export const DEFAULT_STANDING_CONFIG: StandingConfig = {
  points: { minor: 1, moderate: 3, serious: 6, critical: 10 },
  thresholds: { warning: 3, probation: 6, suspended: 10 },
  expiryMonths: 12,
  emailFrom: 'moderate',
  categories: [
    { key: 'props',       label: 'Props not returned to their spot',              severity: 'minor' },
    { key: 'messy',       label: 'Set left messy / needed cleanup',               severity: 'moderate' },
    { key: 'guests',      label: 'Over the guest limit',                          severity: 'moderate' },
    { key: 'unbooked',    label: 'Used a set or gear they did not book',          severity: 'moderate' },
    { key: 'overtime',    label: 'Ran over and did not pay overtime',             severity: 'moderate' },
    { key: 'no_show',     label: 'No-show',                                       severity: 'minor' },
    { key: 'rules',       label: 'Rules violation (fog/haze, nudity in shared hours, unapproved messy concept)', severity: 'serious' },
    { key: 'damage',      label: 'Damage to set, props or gear',                  severity: 'serious' },
    { key: 'conduct',     label: 'Conduct toward staff or other guests',          severity: 'serious' },
    { key: 'theft',       label: 'Theft',                                         severity: 'critical' },
    { key: 'other',       label: 'Other',                                         severity: 'minor' },
  ],
}

export const SEVERITIES: Severity[] = ['minor', 'moderate', 'serious', 'critical']
const SEV_RANK: Record<Severity, number> = { minor: 0, moderate: 1, serious: 2, critical: 3 }
export const severityAtLeast = (s: Severity, floor: Severity) => SEV_RANK[s] >= SEV_RANK[floor]

export const LEVEL_LABEL: Record<StandingLevel, string> = {
  good: 'Good standing', warning: 'Warning', probation: 'Probation', suspended: 'Suspended',
}
export const LEVEL_COLOR: Record<StandingLevel, string> = {
  good: '#4ade80', warning: '#fbbf24', probation: '#fb923c', suspended: '#ef4444',
}
// What each level means, in the customer's words. Shown on /account and in emails.
export const LEVEL_MEANING: Record<StandingLevel, string> = {
  good:      'Everything is available to you, including rewards.',
  warning:   'Rewards and short-notice booking are paused.',
  probation: 'Rewards, short-notice booking and Plus cancellation protection are paused, and new bookings need approval.',
  suspended: 'Booking is paused on this account.',
}

export interface IncidentRow {
  id?: string
  occurred_on: string                  // YYYY-MM-DD
  severity: Severity
  points: number
  voided_at?: string | null
  [k: string]: any
}

export interface Standing {
  level: StandingLevel
  points: number                       // active points
  activeCount: number
  nextDropOff: string | null           // YYYY-MM-DD when the next points expire
  suspendedUntil: string | null
  reason: 'points' | 'banned' | 'suspended_until' | null
}

export function mergeConfig(raw: any): StandingConfig {
  const d = DEFAULT_STANDING_CONFIG
  if (!raw || typeof raw !== 'object') return d
  return {
    points: { ...d.points, ...(raw.points ?? {}) },
    thresholds: { ...d.thresholds, ...(raw.thresholds ?? {}) },
    expiryMonths: Number(raw.expiryMonths) > 0 ? Number(raw.expiryMonths) : d.expiryMonths,
    emailFrom: SEVERITIES.includes(raw.emailFrom) ? raw.emailFrom : d.emailFrom,
    categories: Array.isArray(raw.categories) && raw.categories.length ? raw.categories : d.categories,
  }
}

function addMonths(ymd: string, months: number): string {
  const [y, m, d] = ymd.slice(0, 10).split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + months, d))
  return t.toISOString().slice(0, 10)
}

// The whole rule. Pure — unit-tested in scripts/test-standing.mjs.
export function computeStanding(
  incidents: IncidentRow[],
  customer: { banned?: boolean | null; suspended_until?: string | null } | null,
  config: StandingConfig = DEFAULT_STANDING_CONFIG,
  now: Date = new Date(),
): Standing {
  const today = now.toISOString().slice(0, 10)
  let points = 0, activeCount = 0
  let nextDropOff: string | null = null
  for (const i of incidents) {
    if (i.voided_at) continue
    const pts = Number(i.points) || 0
    if (i.severity === 'critical') { points += pts; activeCount++; continue }   // never drops off
    const dropsOn = addMonths(i.occurred_on, config.expiryMonths)
    if (dropsOn <= today) continue
    points += pts; activeCount++
    if (pts > 0 && (!nextDropOff || dropsOn < nextDropOff)) nextDropOff = dropsOn
  }
  const su = customer?.suspended_until ?? null
  const suActive = !!su && Date.parse(su) > now.getTime()
  let level: StandingLevel = 'good'
  let reason: Standing['reason'] = null
  if (customer?.banned) { level = 'suspended'; reason = 'banned' }
  else if (suActive) { level = 'suspended'; reason = 'suspended_until' }
  else if (points >= config.thresholds.suspended) { level = 'suspended'; reason = 'points' }
  else if (points >= config.thresholds.probation) { level = 'probation'; reason = 'points' }
  else if (points >= config.thresholds.warning) { level = 'warning'; reason = 'points' }
  return { level, points, activeCount, nextDropOff, suspendedUntil: suActive ? su : null, reason }
}

// ── Perks, one place ────────────────────────────────────────────────────────
export const canEarnRewards       = (s: Standing) => s.level === 'good'
export const shortNoticeAllowed   = (s: Standing) => s.level === 'good'
export const cancelProtectionOn   = (s: Standing) => s.level === 'good' || s.level === 'warning'
export const canBook              = (s: Standing) => s.level !== 'suspended'

export const SHORT_NOTICE_PAUSED_ERROR =
  'Short-notice booking is paused while your account is below good standing. Text (832) 408-1631 if you have questions.'

export const PROBATION_BOOKING_ERROR =
  'New bookings on your account need a quick approval right now. Pick your time and tap it to send a request — nothing is charged unless we approve it. Questions? Text (832) 408-1631.'

export const GOOD: Standing = { level: 'good', points: 0, activeCount: 0, nextDropOff: null, suspendedUntil: null, reason: null }

// ── DB helpers (caller passes a SERVICE-ROLE client) ─────────────────────────
export async function loadStandingConfig(db: any): Promise<StandingConfig> {
  const { data } = await db.from('studio_settings').select('value').eq('key', 'standing_config').maybeSingle()
  if (!data?.value) return DEFAULT_STANDING_CONFIG
  try { return mergeConfig(typeof data.value === 'string' ? JSON.parse(data.value) : data.value) }
  catch { return DEFAULT_STANDING_CONFIG }
}

// ⚠️ Fails OPEN to good standing on a read error, and logs it. A database blip
// must never lock a paying customer out of booking; the incident record is
// still there on the next request.
export async function standingForCustomerIds(db: any, ids: string[], config?: StandingConfig): Promise<Map<string, Standing>> {
  const out = new Map<string, Standing>()
  const uniq = Array.from(new Set(ids.filter(Boolean)))
  if (!uniq.length) return out
  const cfg = config ?? await loadStandingConfig(db)
  const custs: any[] = []
  const incs: any[] = []
  for (let i = 0; i < uniq.length; i += 200) {
    const chunk = uniq.slice(i, i + 200)
    const [c, inc] = await Promise.all([
      db.from('customers').select('id, banned, suspended_until').in('id', chunk),
      db.from('customer_incidents').select('customer_id, occurred_on, severity, points, voided_at').in('customer_id', chunk).is('voided_at', null),
    ])
    if (c.error || inc.error) { console.error('[standing] read failed — treating as good standing', c.error ?? inc.error); return out }
    custs.push(...(c.data ?? [])); incs.push(...(inc.data ?? []))
  }
  const byCust = new Map<string, IncidentRow[]>()
  for (const r of incs) { const a = byCust.get(r.customer_id); if (a) a.push(r); else byCust.set(r.customer_id, [r]) }
  for (const c of custs) out.set(c.id, computeStanding(byCust.get(c.id) ?? [], c, cfg))
  return out
}

export async function standingForCustomerId(db: any, id: string | null | undefined): Promise<Standing> {
  if (!id) return GOOD
  return (await standingForCustomerIds(db, [id])).get(id) ?? GOOD
}

export async function standingForEmail(db: any, email: string | null | undefined): Promise<Standing & { customerId: string | null }> {
  const e = String(email ?? '').trim().toLowerCase()
  if (!e) return { ...GOOD, customerId: null }
  const { data, error } = await db.from('customers').select('id').eq('email', e).maybeSingle()
  if (error || !data?.id) return { ...GOOD, customerId: null }
  return { ...(await standingForCustomerId(db, data.id)), customerId: data.id }
}
