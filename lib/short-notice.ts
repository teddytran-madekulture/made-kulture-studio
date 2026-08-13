// Per-customer "short-notice" override: lets a specific logged-in customer book
// inside the studio's 48-hour advance window. Optionally expires on a date, after
// which the normal 48-hour rule applies again.

export function todayDateStr(): string {
  return new Date().toISOString().split('T')[0]
}

// Current date in the studio's timezone (Houston), as YYYY-MM-DD.
export function chiTodayStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago' }).format(new Date())
}

// Current Houston time as a decimal hour (e.g. 14.5 = 2:30 PM). Used to gray out
// slots that have already passed when someone books same-day.
export function chiNowDecimal(): number {
  const p = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: 'numeric', hour12: false }).formatToParts(new Date())
  const h = Number(p.find(x => x.type === 'hour')?.value ?? 0)
  const m = Number(p.find(x => x.type === 'minute')?.value ?? 0)
  return h + m / 60
}

// True when the customer may book same-day right now. `po` is the customer's
// pricing_overrides object (may be null).
//
// Two grant shapes are supported, and the customer is active if EITHER is
// currently valid:
//   • short_notice_expires_at — a precise timestamp window (e.g. 1 hour from
//     approval of a short-notice request). Once it passes, access ends.
//   • short_notice_until — a whole-day expiry date (manual admin grants / longer
//     standing access). Active through that date, inclusive.
// If short_notice is on with NEITHER field set, it's an indefinite grant
// (on until turned off) — preserves the legacy behavior.
export function shortNoticeActive(po: any): boolean {
  if (!po || !po.short_notice) return false
  const exp = po.short_notice_expires_at
  const until = po.short_notice_until
  if (exp && Date.now() < new Date(exp).getTime()) return true   // timed window still open
  if (until && String(until) >= todayDateStr()) return true       // date window still open
  if (!exp && !until) return true                                 // indefinite grant
  return false
}

// ── Scoped grants ────────────────────────────────────────────────────────────
// A timed approval is granted FOR A SPECIFIC ASK — "yes, Set B on Thursday at
// 7pm". Without a scope the grant opened the whole 48-hour window, so somebody
// approved for a 7pm evening could book 9am instead and the owner would be
// opening the building at a time he never agreed to.
//
// ⚠️ Absent scope = unrestricted, deliberately. Manual admin grants and the
// broader "48h" / "until date" approvals carry no scope and keep their old
// behaviour, so nothing existing changes meaning.
export interface ShortNoticeScope { set: string; date: string; start: number }

export function shortNoticeScopeOf(po: any): ShortNoticeScope | null {
  const sc = po?.short_notice_scope
  if (!sc || typeof sc !== 'object') return null
  if (typeof sc.set !== 'string' || typeof sc.date !== 'string' || typeof sc.start !== 'number') return null
  return { set: sc.set, date: sc.date, start: sc.start }
}

// True when a line matches the scope. Length is deliberately NOT constrained —
// once the owner is on site for that start time, the customer choosing 1hr or
// 2hr does not change when he has to show up, and he sees the final end time on
// the booking alert.
export function lineMatchesScope(scope: ShortNoticeScope, line: { setSlug: string | null; date: string; startHour: number }): boolean {
  return line.setSlug === scope.set && line.date === scope.date && line.startHour === scope.start
}

// The active timed-window expiry (ms epoch) if the customer is inside a timed
// short-notice grant right now, else null. Drives the customer-facing countdown.
export function shortNoticeExpiresAtMs(po: any): number | null {
  if (!po || !po.short_notice || !po.short_notice_expires_at) return null
  const ms = new Date(po.short_notice_expires_at).getTime()
  return Number.isFinite(ms) && ms > Date.now() ? ms : null
}

// ── Plus membership ──────────────────────────────────────────────────────────
// A paid "Plus" membership lives on pricing_overrides as:
//   plus: true, plus_started_at, plus_expires_at (ISO), plus_auto_renew, plus_comp
// While active it grants short-notice VIEW (see the 48-hr window) + eligibility
// to REQUEST short-notice booking (owner still approves each request).

// True when the customer's Plus membership is currently active.
export function plusActive(po: any): boolean {
  if (!po || !po.plus) return false
  if (!po.plus_expires_at) return true                       // active until turned off
  return Date.now() < new Date(po.plus_expires_at).getTime() // active through the expiry
}

// Plus expiry as ms epoch (for renewal-date display), or null if not active.
export function plusExpiresAtMs(po: any): number | null {
  if (!plusActive(po) || !po?.plus_expires_at) return null
  const ms = new Date(po.plus_expires_at).getTime()
  return Number.isFinite(ms) ? ms : null
}

// True when the customer may VIEW availability inside the 48-hr window. Granted
// by a manual `short_notice_view` flag, by an active Plus membership, or by any
// booking-level short-notice grant (which implies viewing too).
export function shortNoticeViewActive(po: any): boolean {
  if (!po) return false
  return !!po.short_notice_view || plusActive(po) || shortNoticeActive(po)
}

// ── The advance-booking window, SERVER SIDE ─────────────────────────────────
// The public booking UI refuses to show dates inside the advance window, but
// until now that was the ONLY place it was enforced — a direct POST to
// /api/bookings could reserve a slot for two hours from now. Door PINs,
// cleaning and turnaround all assume notice, so this is enforced on the
// server too.
//
// ⚠️ The rule is deliberately a CALENDAR-DAY floor, not a literal 48-hour
// subtraction, because that is what `today()` in app/book/BookClient.tsx
// actually does (`d.setDate(d.getDate() + 2)`). Real notice therefore ranges
// from roughly 34 to 57 hours depending on the time of day. A strict 48-hour
// check here would REJECT bookings the UI happily offers, which is worse than
// the hole it closes. The copy says "48 hours"; the code says "two days".
// Reconcile them deliberately, not by tightening one side in isolation.
export const ADVANCE_DAYS = 2

// Earliest date the public may book, as YYYY-MM-DD in the studio's timezone.
// Uses Central rather than the browser's UTC-tinged date, so this is never
// STRICTER than the client — after 7 PM Houston the client is a day more
// conservative than this, which is fine. It must never be the other way round.
export function minAdvanceDateStr(): string {
  const [y, m, d] = chiTodayStr().split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  t.setUTCDate(t.getUTCDate() + ADVANCE_DAYS)
  return t.toISOString().slice(0, 10)
}

// True if ANY of the requested dates falls inside the advance window.
export function violatesAdvanceWindow(dates: (string | null | undefined)[]): boolean {
  const min = minAdvanceDateStr()
  return dates.some(d => !!d && d < min)
}

// Whether the SIGNED-IN customer carries an explicit short-notice BOOKING
// grant. Takes the caller's supabase client so this file stays importable
// from client components.
//
// ⚠️ Pass the email from the verified auth session, NEVER the email field on
// the request body — that is attacker-controlled, and trusting it would let
// anyone borrow an approved customer's short-notice window by typing their
// address into the checkout form.
//
// Plus membership alone does NOT qualify. Plus grants short-notice VIEW plus
// eligibility to REQUEST; approving a request is what writes the timed grant
// that shortNoticeActive() reads.
export async function sessionMayBookShortNotice(supabase: any, sessionEmail: string | null | undefined): Promise<boolean> {
  if (!sessionEmail) return false
  const { data } = await supabase
    .from('customers')
    .select('pricing_overrides')
    .eq('email', String(sessionEmail).toLowerCase().trim())
    .maybeSingle()
  return shortNoticeActive(data?.pricing_overrides ?? null)
}

export const ADVANCE_WINDOW_ERROR =
  'Sessions need to be booked at least two days out. Text (832) 408-1631 and we\u2019ll see what we can do about a short-notice session.'
