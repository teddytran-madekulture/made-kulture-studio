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
