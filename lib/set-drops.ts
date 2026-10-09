// SET DROPS — pure helpers shared by the server, the admin page and the public
// drop page (no Supabase, no server-only imports). Migration 155.
//
// A drop: announce a temporary set → customers put down a deposit → Teddy
// presses GO (build it; deposits become studio credit + perks) or CANCEL.
// Spec: MK_Set_Drops_Spec_2026-10-09_v2.docx.
//
// ⚠️ THE TERMS SENTENCES ARE GENERATED FROM THE DROP'S SETTINGS (dropTerms) and
// are what the customer ticks before paying — they are stored verbatim on the
// pledge as dispute evidence. Never hand-write a promise on a drop page that
// this function does not also produce.

export type DropStatus = 'draft' | 'pre_reserve' | 'funded' | 'cancelled' | 'archived'
export type CancelPolicy = 'refund' | 'credit' | 'choice' | 'decide_later'

export interface SetDrop {
  id: string
  slug: string
  name: string
  tagline: string | null
  description: string | null
  hero_url: string | null
  gallery: string[]
  video_url: string | null
  video_hero: boolean
  /** Photos customers shot here in past years (migration 156). */
  past_gallery: { url: string; credit: string | null }[]
  status: DropStatus
  set_id: string | null
  replaces_set_id: string | null
  closure_id: string | null
  open_call_id: string | null
  deposit_mode: 'flat' | 'per_hour'
  deposit_cents: number
  max_hours_per_pledge: number
  goal_type: 'people' | 'hours' | 'dollars'
  goal_value: number
  show_goal: boolean
  pre_reserve_ends_at: string | null
  run_starts: string | null   // YYYY-MM-DD (Central)
  run_ends: string | null
  rate_per_hour: number
  min_hours: number
  capacity: number
  perk_early_access: boolean
  early_access_hours: number
  perk_discount: boolean
  discount_kind: 'percent' | 'fixed_rate'
  discount_value: number
  discount_scope: 'all' | 'pledged_hours'
  bonus_credit_cents: number
  cancel_policy: CancelPolicy
  cancel_resolution: 'refund' | 'credit' | 'choice' | null
  funded_at: string | null
  early_access_ends_at: string | null
  cancelled_at: string | null
  created_at: string
  updated_at: string
}

export interface DropPledge {
  id: string
  drop_id: string
  auth_user_id: string
  customer_email: string
  customer_name: string | null
  phone: string | null
  hours_wanted: number | null   // optional on flat-deposit drops (migration 157)
  timing_note: string | null
  deposit_cents: number
  status: 'active' | 'credited' | 'refunded' | 'pending_choice' | 'refund_failed'
  credit_cents_issued: number
  created_at: string
}

/** Pledges that still count toward the goal / the money held. */
export const LIVE_PLEDGE = (p: { status: string }) => p.status !== 'refunded'

// ── Money ───────────────────────────────────────────────────────────────────
export const dollars = (cents: number) =>
  `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`

export function clampHours(drop: Pick<SetDrop, 'max_hours_per_pledge' | 'min_hours'>, hours: number): number {
  const max = Number(drop.max_hours_per_pledge) || 8
  const min = Math.max(0.5, Number(drop.min_hours) || 1)
  const h = Math.round((Number(hours) || 0) * 2) / 2
  return Math.min(max, Math.max(min, h))
}

/** What a pledge of `hours` costs up front. */
export function depositFor(drop: Pick<SetDrop, 'deposit_mode' | 'deposit_cents'>, hours: number): number {
  return drop.deposit_mode === 'per_hour'
    ? Math.round(drop.deposit_cents * hours)
    : drop.deposit_cents
}

/** The hourly rate a depositor pays on the drop's set when the discount perk is on. */
export function depositorRate(drop: Pick<SetDrop, 'perk_discount' | 'discount_kind' | 'discount_value' | 'rate_per_hour'>): number | null {
  if (!drop.perk_discount) return null
  const list = Number(drop.rate_per_hour) || 0
  const v = Number(drop.discount_value) || 0
  const r = drop.discount_kind === 'fixed_rate' ? v : list * (1 - v / 100)
  // ⚠️ WHOLE DOLLARS. Checkout sells half-hours, and the client's total must
  // equal the server's to the cent (the tamper check in app/api/bookings). A
  // $63.75 rate makes 2.5h = $159.375 — the two sides round differently and
  // every such booking is refused. Whole dollars × half-hours is always cents.
  const rounded = Math.round(r)
  return rounded > 0 && rounded < list ? rounded : null
}

// ── Progress ────────────────────────────────────────────────────────────────
export interface DropProgress {
  people: number
  hours: number
  dollars: number          // projected space revenue at the drop's list rate
  depositsCents: number
  current: number          // in goal units
  goal: number
  pct: number              // 0–100, capped
  label: string            // "14 of 20 reserved"
}

export function dropProgress(drop: SetDrop, pledges: DropPledge[]): DropProgress {
  const live = pledges.filter(LIVE_PLEDGE)
  const people = live.length
  const hours = live.reduce((s, p) => s + Number(p.hours_wanted || 0), 0)
  const projected = Math.round(hours * Number(drop.rate_per_hour || 0))
  const depositsCents = live.reduce((s, p) => s + Number(p.deposit_cents || 0), 0)
  const goal = Number(drop.goal_value) || 0
  const current = drop.goal_type === 'people' ? people : drop.goal_type === 'hours' ? hours : projected
  const pct = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0
  const label =
    drop.goal_type === 'people'  ? `${people} of ${goal} bookings reserved`
    : drop.goal_type === 'hours' ? `${fmtNum(hours)} of ${fmtNum(goal)} hours reserved`
    : `$${projected.toLocaleString()} of $${Math.round(goal).toLocaleString()} reserved`
  return { people, hours, dollars: projected, depositsCents, current, goal, pct, label }
}

const fmtNum = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

// ── Phase (what a visitor sees right now) ───────────────────────────────────
export type DropPhase =
  | 'draft'         // not public
  | 'pre_reserve'   // taking deposits
  | 'deciding'      // deadline passed, waiting for GO/CANCEL
  | 'early_access'  // funded, depositors booking first
  | 'open'          // funded, anyone can book (before or during the run)
  | 'ended'         // run is over
  | 'cancelled'
  | 'archived'

/** Today's date in Central, YYYY-MM-DD. */
export function centralToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export function dropPhase(drop: SetDrop, now: Date = new Date()): DropPhase {
  switch (drop.status) {
    case 'draft': return 'draft'
    case 'cancelled': return 'cancelled'
    case 'archived': return 'archived'
    case 'pre_reserve':
      return drop.pre_reserve_ends_at && now.getTime() >= Date.parse(drop.pre_reserve_ends_at) ? 'deciding' : 'pre_reserve'
    case 'funded': {
      if (drop.run_ends && centralToday(now) > drop.run_ends) return 'ended'
      if (drop.early_access_ends_at && now.getTime() < Date.parse(drop.early_access_ends_at)) return 'early_access'
      return 'open'
    }
  }
  return 'draft'
}

// ── Dates ───────────────────────────────────────────────────────────────────
export function fmtDate(ymd: string | null | undefined, opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }): string {
  if (!ymd) return ''
  const [y, m, d] = ymd.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString('en-US', { ...opts, timeZone: 'UTC' })
}

export function fmtInstant(iso: string | null | undefined): string {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Chicago', weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso))
}

export function runLabel(drop: Pick<SetDrop, 'run_starts' | 'run_ends'>): string {
  if (!drop.run_starts || !drop.run_ends) return 'Dates to be announced'
  return `${fmtDate(drop.run_starts)} – ${fmtDate(drop.run_ends, { month: 'short', day: 'numeric', year: 'numeric' })}`
}

// ── The promise, in words ───────────────────────────────────────────────────
export interface DropTerms {
  ifFunded: string
  ifCancelled: string
  balance: string
  /** The exact text stored on the pledge when the box is ticked. */
  full: string
}

export function dropTerms(drop: SetDrop, hours: number): DropTerms {
  const dep = depositFor(drop, hours)
  const depS = dollars(dep)
  const perks: string[] = []
  if (drop.perk_early_access && drop.early_access_hours > 0) perks.push(`${drop.early_access_hours}-hour early access to book before everyone else`)
  const dr = depositorRate(drop)
  if (dr != null) {
    const scope = drop.discount_scope === 'pledged_hours' ? ` on bookings up to the ${fmtNum(hours)} hours you reserved` : ' on your bookings during the run'
    perks.push(`$${fmtNum(dr)}/hr instead of $${fmtNum(Number(drop.rate_per_hour))}${scope}`)
  }
  const credit = dep + (drop.bonus_credit_cents || 0)
  const creditS = drop.bonus_credit_cents > 0 ? `${dollars(credit)} in studio credit (your ${depS} plus a ${dollars(drop.bonus_credit_cents)} bonus)` : `${depS} in studio credit`
  const ifFunded = `If ${drop.name} is built, your deposit becomes ${creditS} toward your booking${perks.length ? `, plus ${joinAnd(perks)}` : ''}.`

  let ifCancelled: string
  switch (drop.cancel_policy) {
    case 'refund': ifCancelled = `If ${drop.name} doesn't get built, your ${depS} deposit is fully refunded to your card.`; break
    case 'credit': ifCancelled = `If ${drop.name} doesn't get built, your ${depS} deposit becomes studio credit you can use on any set. It is not refundable to your card.`; break
    case 'choice': ifCancelled = `If ${drop.name} doesn't get built, you choose: a full refund to your card or ${depS} in studio credit. If you don't choose within 7 days, it is refunded.`; break
    default: ifCancelled = `If ${drop.name} doesn't get built, your ${depS} deposit comes back as either a refund to your card or studio credit.`
  }
  const balance = `Your deposit is not a booking. You pick your exact date and time later, at normal checkout, and pay the rest then.`
  return { ifFunded, ifCancelled, balance, full: [ifFunded, ifCancelled, balance].join(' ') }
}

function joinAnd(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? ''
  return `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`
}

/**
 * Once a deposit exists, the cancel policy may only move in the customer's
 * favour. Ranking: refund (best) > choice > decide_later > credit (worst).
 */
const CANCEL_RANK: Record<CancelPolicy, number> = { credit: 0, decide_later: 1, choice: 2, refund: 3 }
export function cancelPolicyChangeAllowed(from: CancelPolicy, to: CancelPolicy): boolean {
  return CANCEL_RANK[to] >= CANCEL_RANK[from]
}

/** The cancel outcomes Teddy may pick at CANCEL time under a policy. */
export function cancelOutcomesFor(policy: CancelPolicy): ('refund' | 'credit' | 'choice')[] {
  if (policy === 'decide_later') return ['refund', 'credit', 'choice']
  return [policy]
}

export function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
}
