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

// ⚠️ FALLBACK ONLY (2026-10-09). The live rates are the `sets` table; see
// lib/set-catalog.ts. This table now prices only rows with no hourly_rate whose
// set join is missing — it matches the database for the ten original sets.
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
  /** The hourly set rate this row was SOLD at (migration 154) — list, negotiated,
   *  Set Drop or depositor rate, before any guest surcharge. NULL on older rows. */
  hourly_rate?: number | null
  /** Joined `sets ( rate_per_hour )` — the live list rate, used when hourly_rate is NULL. */
  sets?: { name?: string | null; rate_per_hour?: number | null } | null
  guest_surcharge_amount?: number | null
  /** Extra-person fee (party over the set's capacity) for this row's window. */
  guest_fee_amount?: number | null
  start_time: string
  end_time: string
}

function hoursOf(b: { start_time: string; end_time: string }): number {
  const h = (Date.parse(b.end_time) - Date.parse(b.start_time)) / 3_600_000
  return Number.isFinite(h) && h > 0 ? h : 0
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
  const hours = hoursOf(booking)
  return hours ? total / hours : 0
}

/**
 * The per-hour extra-person fee on this booking (party over the set's
 * capacity, $X per extra person per hour). Same shape as the surcharge: the
 * column is a TOTAL for the row's window, divided back down here.
 *
 * Teddy, 2026-10-08: added time ignored this fee entirely, so a party of 7
 * extending paid only the set rate. CHANGE PARTY SIZE rewrites the column for
 * the row's hours, so raising the party first and then adding time prices the
 * extra people in.
 */
export function guestFeePerHourOf(booking: SurchargeBooking): number {
  const total = Number(booking.guest_fee_amount ?? 0)
  if (!Number.isFinite(total) || total <= 0) return 0
  const hours = hoursOf(booking)
  return hours ? total / hours : 0
}

/**
 * The surcharge + extra-person fee a row should carry once its window changes,
 * at the SAME per-hour rates it was sold at. Every path that moves end_time
 * (extensions, desk add-time, admin edit) writes these back, or the stored
 * total stays put while the hours grow and the next extension divides it into
 * a lower per-hour rate than the customer actually pays.
 */
export function guestAmountsForWindow(booking: SurchargeBooking, newStartISO: string, newEndISO: string) {
  const newHours = hoursOf({ start_time: newStartISO, end_time: newEndISO })
  const round = (n: number) => Math.round(n * 100) / 100
  return {
    guest_surcharge_amount: round(guestSurchargePerHourOf(booking) * newHours),
    guest_fee_amount: round(guestFeePerHourOf(booking) * newHours),
  }
}

/**
 * Checkout: give EACH booking row its own share of the guest surcharge and
 * the extra-person fee, instead of banking the whole order's amounts on the
 * first row (Korin Harriz, 2026-10-08: two sessions, the $30 surcharge sat on
 * Set B, so Set B "cost" $60/hr and Set C $40/hr to every add-time path).
 *
 * The fee is worked out per WINDOW exactly as checkout prices it (party over
 * capacity x sets in that window) and split evenly across that window's rows.
 * The cents always sum to the order totals; if they somehow don't, it falls
 * back to the old first-row banking rather than store something that
 * disagrees with what was charged.
 */
export function guestSharesByLine(
  lines: { date: string; startHour: number; endHour: number }[],
  o: { guestCount: number; capacity: number; perPersonFee: number; feeTotal: number; surchargePerHour: number; surchargeTotal: number; isStudio: boolean },
): { fee: number[]; surcharge: number[] } {
  const firstRow = (total: number) => lines.map((_, i) => (i === 0 ? total : 0))
  const banked = { fee: firstRow(o.feeTotal), surcharge: firstRow(o.surchargeTotal) }
  if (o.isStudio || lines.length <= 1) return banked

  const fee = lines.map(() => 0)
  if (o.guestCount > 0 && o.feeTotal > 0) {
    const wins: Record<string, number[]> = {}
    lines.forEach((l, i) => { (wins[`${l.date}|${l.startHour}|${l.endHour}`] ??= []).push(i) })
    for (const idx of Object.values(wins)) {
      const l = lines[idx[0]]
      const over = Math.max(0, o.guestCount - o.capacity * idx.length)
      const cents = Math.round(over * o.perPersonFee * (l.endHour - l.startHour) * 100)
      const each = Math.floor(cents / idx.length)
      let rem = cents - each * idx.length
      for (const i of idx) { fee[i] = (each + (rem > 0 ? 1 : 0)) / 100; if (rem > 0) rem-- }
    }
  }
  const surcharge = lines.map(l => (o.surchargeTotal > 0 ? Math.round(o.surchargePerHour * (l.endHour - l.startHour) * 100) / 100 : 0))

  const cents = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) * 100)
  if (cents(fee) !== Math.round(o.feeTotal * 100) || cents(surcharge) !== Math.round(o.surchargeTotal * 100)) {
    console.error('[guestSharesByLine] split does not sum to the order totals; banking on the first row', { fee, surcharge, o })
    return banked
  }
  return { fee, surcharge }
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
  // 1. What this row was actually sold at, when it says (every booking since
  //    2026-10-09). This is what makes a Set Drop's own rate, a depositor
  //    discount or a rate changed in admin carry through to add-time.
  // 2. Otherwise the live list rate from the `sets` row, or a negotiated rate.
  // 3. Only then the old hardcoded table (pre-migration rows on the ten
  //    original sets, where it matches the database to the dollar).
  const sold = Number(booking.hourly_rate)
  const list = Number(booking.sets?.rate_per_hour)
  const base = sold > 0
    ? sold
    : (!hasRateOverride(setName, overrides) && list > 0 ? list : rateFor(setName, overrides))
  if (!base) return 0
  // The extra-person fee applies either way — a negotiated rate covers the
  // set, not people beyond its capacity (checkout charges it to everyone).
  const extraPeople = guestFeePerHourOf(booking)
  if (hasRateOverride(setName, overrides)) return base + extraPeople
  return base + guestSurchargePerHourOf(booking) + extraPeople
}
