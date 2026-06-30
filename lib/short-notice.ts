// Per-customer "short-notice" override: lets a specific logged-in customer book
// inside the studio's 48-hour advance window. Optionally expires on a date, after
// which the normal 48-hour rule applies again.

export function todayDateStr(): string {
  return new Date().toISOString().split('T')[0]
}

// True when the customer may book same-day right now. `po` is the customer's
// pricing_overrides object (may be null).
export function shortNoticeActive(po: any): boolean {
  if (!po || !po.short_notice) return false
  if (!po.short_notice_until) return true // no expiry → active until turned off
  return String(po.short_notice_until) >= todayDateStr() // active through the "until" date (inclusive)
}
