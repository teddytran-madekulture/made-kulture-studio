// The one place that answers "what does an hour on this booking cost?"
//
// This file exists because that question had FOUR answers. lib/extensions.ts,
// app/api/desk/bookings/[id]/add-time, app/admin/dashboard's SET_RATES and the
// checkout path each carried their own copy of the set-rate table, and when the
// non-member surcharge was added to checkout in 2026 the other three never
// learned about it. A guest who booked at $50/hr extended at $40 — on the SMS
// link, the kiosk tablet, the staff desk and the admin modal alike.
//
// Deliberately PURE and dependency-free: no Supabase, no server-only imports, so
// the admin dashboard (a client component) can import the same arithmetic the
// API routes use instead of keeping a fourth copy in sync by hand.

export const RATE_BY_NAME: Record<string, number> = {
  'Set A': 40, 'Set B': 40, 'Set C': 40, 'Set D': 40,
  'Concrete': 40, 'Vintage': 40, 'Cottage': 40,
  'The Watering Hole': 75, 'The Tank': 75, 'Studio One': 65,
}

export const SLUG_BY_NAME: Record<string, string> = {
  'Set A': 'set-a', 'Set B': 'set-b', 'Set C': 'set-c', 'Set D': 'set-d',
  'Concrete': 'concrete', 'Vintage': 'vintage', 'Cottage': 'cottage',
  'The Watering Hole': 'watering-hole', 'The Tank': 'the-tank', 'Studio One': 'studio-one',
}

/** The set's list rate, or this customer's negotiated rate if they have one. */
export function rateFor(setName: string | undefined, overrides: any): number {
  if (!setName) return 0
  let rate = RATE_BY_NAME[setName] ?? 0
  if (overrides) {
    const slug = SLUG_BY_NAME[setName]
    const perSet = slug ? overrides.sets?.[slug] : undefined
    if (perSet != null) rate = Number(perSet)
    else if (overrides.hourly_rate != null) rate = Number(overrides.hourly_rate)
  }
  return rate
}

/** True when this customer has a negotiated rate that REPLACES the list price. */
export function hasRateOverride(setName: string | undefined, overrides: any): boolean {
  if (!overrides || !setName) return false
  const slug = SLUG_BY_NAME[setName]
  return (slug != null && overrides.sets?.[slug] != null) || overrides.hourly_rate != null
}

export interface SurchargeBooking {
  guest_surcharge_amount?: number | null
  start_time: string
  end_time: string
}

/**
 * The per-hour guest surcharge this booking was actually sold at.
 *
 * The column stores a TOTAL for the original window (surcharge x set hours), so
 * it has to be divided back down before it can price one more hour.
 *
 * ⚠️ Recovered from the booking rather than re-derived from who the customer is
 * today. They may have created an account since — and `auth_user_id` is set by
 * matching the typed email against auth.users, not from the verified session
 * (app/api/bookings/route.ts), so it is not proof of membership either way.
 * Signing up later must not retroactively change the rate of a paid booking.
 *
 * ⚠️ NULL (a row predating migration 100, or one whose breakdown could not be
 * inferred) returns 0 — the historical behaviour. A guessed surcharge on a real
 * card is worse than a known-conservative undercharge.
 */
export function guestSurchargePerHourOf(booking: SurchargeBooking): number {
  const total = Number(booking.guest_surcharge_amount ?? 0)
  if (!Number.isFinite(total) || total <= 0) return 0
  const hours = (Date.parse(booking.end_time) - Date.parse(booking.start_time)) / 3_600_000
  if (!Number.isFinite(hours) || hours <= 0) return 0
  return total / hours
}

/**
 * What one more hour on THIS booking costs the customer who holds it.
 *
 * ⚠️ A per-customer override REPLACES the rate rather than discounting it — a
 * negotiated hourly is the whole deal, not a base to stack a surcharge on.
 */
export function effectiveHourlyRate(
  setName: string | undefined,
  overrides: any,
  booking: SurchargeBooking,
): number {
  const base = rateFor(setName, overrides)
  if (!base) return 0
  if (hasRateOverride(setName, overrides)) return base
  return base + guestSurchargePerHourOf(booking)
}
