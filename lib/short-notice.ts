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
export function shortNoticeActive(po: any): boolean {
  if (!po || !po.short_notice) return false
  if (!po.short_notice_until) return true // no expiry → active until turned off
  return String(po.short_notice_until) >= todayDateStr() // active through the "until" date (inclusive)
}

// True when the customer may VIEW availability inside the 48-hr window. This is
// a separate, view-only grant (`short_notice_view`); anyone who can BOOK
// short-notice can obviously also see it.
export function shortNoticeViewActive(po: any): boolean {
  if (!po) return false
  return !!po.short_notice_view || shortNoticeActive(po)
}
