// MINI SESSIONS — pure helpers shared by the API routes and the pages (no
// Supabase, no server-only imports). Migration 158.
//
// A photographer turns one of their bookings into a mini-session day. The booked
// hours are cut into slots; their clients sign up through a share link; the
// photographer gets a roster. Made Kulture NEVER takes the clients' money.
//
// ⚠️ A slot is an INDEX into the booking, never a stored clock time. Its time is
// always computed from the booking's CURRENT start — so a reschedule moves every
// slot with it, and there is no second copy of the time to drift.
//
// ⚠️ THE HEADCOUNT RULE is the point of this feature for the studio:
//   crew + the party in a slot ≤ the booking's limit.
// Clients are told to wait OUTSIDE until their slot, so two parties never stack.

export type MiniStatus = 'open' | 'closed' | 'cancelled'
export type MiniClientStatus = 'booked' | 'cancelled' | 'removed' | 'bumped'

export interface MiniSession {
  id: string
  booking_id: string
  owner_user_id: string
  title: string | null
  note: string | null
  price_text: string | null
  slot_minutes: number
  break_minutes: number
  crew_count: number
  cutoff_hours: number
  blocked_slots: number[]
  approve_switches: boolean            // migration 159 — switches need the photographer's OK
  allow_extra_guests: boolean          // migration 160 — bigger groups, billed to the photographer
  extra_card_id: string | null
  extra_square_customer_id: string | null
  extra_charge_status: 'charging' | 'charged' | 'link_sent' | 'none' | 'review' | null
  extra_charge_cents: number | null
  extra_fee_cents: number | null          // the fee agreed when bigger groups were turned on
  extra_charge_claimed_at: string | null
  extra_payment_id: string | null
  extra_charged_at: string | null
  share_token: string
  status: MiniStatus
  announced_start: string | null
  last_sms_broadcast_at: string | null
  purged_at: string | null
  created_at: string
  updated_at: string
}

export interface MiniClient {
  id: string
  mini_session_id: string
  slot_index: number
  name: string | null
  email: string | null
  phone: string | null
  party_size: number
  sms_ok: boolean
  status: MiniClientStatus
  added_by: 'client' | 'photographer'
  manage_token: string
  checked_in_at: string | null
  reminder_sent_at: string | null
  pending_slot: number | null          // a requested switch awaiting approval
  told_start: string | null
  purged_at: string | null
  created_at: string
}

/** The booking fields Mini Sessions needs. A buyout has set_id null. */
export interface MiniBooking {
  id: string
  start_time: string
  end_time: string
  status: string
  set_id: string | null
  guest_count: number | null
  sets?: { name: string | null; slug?: string | null } | null
}

// Defaults Teddy picked (2026-10-09): 5-min break, 12-hour cutoff, 90-day
// retention, next client waits outside.
export const DEFAULTS = { slot_minutes: 20, break_minutes: 5, crew_count: 1, cutoff_hours: 12 }
export const SLOT_CHOICES = [10, 15, 20, 30, 45, 60]
export const RETENTION_DAYS = 90
export const BUYOUT_LIMIT = 30

export interface Slot { index: number; startISO: string; endISO: string }

/** Every slot that fits inside the booking, in order. */
export function slotsFor(b: Pick<MiniBooking, 'start_time' | 'end_time'>, m: Pick<MiniSession, 'slot_minutes' | 'break_minutes'>): Slot[] {
  const start = Date.parse(b.start_time), end = Date.parse(b.end_time)
  const len = Math.max(5, Number(m.slot_minutes) || 20) * 60_000
  const step = len + Math.max(0, Number(m.break_minutes) || 0) * 60_000
  const out: Slot[] = []
  for (let t = start, i = 0; t + len <= end && i < 500; t += step, i++) {
    out.push({ index: i, startISO: new Date(t).toISOString(), endISO: new Date(t + len).toISOString() })
  }
  return out
}

/**
 * The most people allowed on the booking at once. A set is 5 included; if the
 * photographer declared (and paid for) more at checkout — up to the set's max —
 * that number is the limit. A buyout is 30.
 */
export function headcountLimit(b: Pick<MiniBooking, 'set_id' | 'guest_count'>, s: { capacity: number; maxPerSet: number }): number {
  if (!b.set_id) return BUYOUT_LIMIT
  const declared = Math.floor(Number(b.guest_count) || 0)
  return Math.min(s.maxPerSet, Math.max(s.capacity, declared))
}

/** Largest client party (client included) that fits beside the crew. */
export function maxParty(limit: number, crew: number): number {
  return Math.max(0, limit - Math.max(1, crew))
}

/**
 * Party sizes for a mini day (migration 160).
 *   included — what the booking already covers
 *   max      — the most a client may bring: included, or with bigger groups on,
 *              up to the set's hard max (7) / a buyout's 30
 * A person over `included` is an extra guest, billed to the photographer.
 */
export function partyRoom(
  b: Pick<MiniBooking, 'set_id' | 'guest_count'>,
  m: Pick<MiniSession, 'crew_count' | 'allow_extra_guests'>,
  s: { capacity: number; maxPerSet: number },
): { included: number; max: number } {
  const included = maxParty(headcountLimit(b, s), m.crew_count)
  const hard = b.set_id ? s.maxPerSet : BUYOUT_LIMIT
  return { included, max: m.allow_extra_guests ? Math.max(included, maxParty(hard, m.crew_count)) : included }
}

export const extrasFor = (party: number, included: number) => Math.max(0, Math.floor(party) - included)


/** Sign-ups close this many hours before the booking starts. */
export function signupsClosed(b: Pick<MiniBooking, 'start_time'>, m: Pick<MiniSession, 'cutoff_hours'>, now = Date.now()): boolean {
  return now >= Date.parse(b.start_time) - (Number(m.cutoff_hours) || 0) * 3_600_000
}

// ── Time formatting (always Central — the studio's clock) ───────────────────
const TZ = 'America/Chicago'
export function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
}
export function fmtDay(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'long', month: 'long', day: 'numeric' }).format(new Date(iso))
}
export function fmtDayShort(iso: string): string {
  return new Intl.DateTimeFormat('en-US', { timeZone: TZ, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(iso))
}
export function slotLabel(s: Pick<Slot, 'startISO' | 'endISO'>): string {
  return `${fmtTime(s.startISO)} – ${fmtTime(s.endISO)}`
}

// ── Input hygiene ───────────────────────────────────────────────────────────
export function cleanText(v: unknown, max: number): string | null {
  const s = String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
  return s || null
}
export function cleanEmail(v: unknown): string | null {
  const s = String(v ?? '').trim().toLowerCase().slice(0, 200)
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s : null
}
/** 10-digit US number, the shape phones are stored in across the app. */
export function cleanPhone(v: unknown): string | null {
  let d = String(v ?? '').replace(/\D/g, '')
  if (d.length === 11 && d.startsWith('1')) d = d.slice(1)
  return d.length === 10 ? d : null
}
export function fmtPhone(d: string | null | undefined): string {
  const s = String(d ?? '')
  return s.length === 10 ? `(${s.slice(0, 3)}) ${s.slice(3, 6)}-${s.slice(6)}` : s
}

/** HTML-escape for anything a client or photographer typed that lands in an email. */
export function esc(s: unknown): string {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
