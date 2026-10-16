// Birth date on member profiles (migration 171, 2026-10-16).
//
// ONE validator for the signup form, /welcome and the profile API so the
// browser and the server can never disagree about what counts as a date.
// Pure and dependency-free on purpose — it's imported client-side.
//
// Accepts exactly YYYY-MM-DD (what <input type="date"> produces), a real
// calendar date, from 1900-01-01 up to today. Returns the same string, or
// null if it isn't usable. No age rule lives here — Teddy asked for the date
// only, no perks or gating yet.

export function cleanBirthDate(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const s = v.trim()
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s)
  if (!m) return null
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
  const dt = new Date(Date.UTC(y, mo - 1, d))
  // Rejects 2026-02-31 etc: Date rolls those over to another day.
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  if (y < 1900) return null
  if (s > todayIso()) return null
  return s
}

// Today as YYYY-MM-DD in Houston time — the `max` for the date picker and the
// upper bound above. (A UTC "today" runs a day ahead every evening.)
export function todayIso(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

// ── Under-18 rule (2026-10-16) ──────────────────────────────────────────────
// Teddy: kids shoot with their families, but the parent is the one who signs
// up — so accounts are 18+. Enforced in THREE places that must agree, all
// through this one function / the same cutoff:
//   1. app/signup — refuses before calling Supabase (the friendly path)
//   2. handle_new_user trigger (migration 171) — raises, so a tampered form
//      still can't create the account
//   3. /api/account/profile — Google/Apple sign-ups and existing members add
//      their date on /welcome; under 18 => blocked + owner alert
export const MIN_ACCOUNT_AGE = 18

// Whole years old today (Houston date). bd must already be cleanBirthDate()'d.
export function ageOn(bd: string, today: string = todayIso()): number {
  const [y, m, d] = bd.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  let age = ty - y
  if (tm < m || (tm === m && td < d)) age--
  return age
}

export function isUnderAge(bd: string): boolean {
  return ageOn(bd) < MIN_ACCOUNT_AGE
}

// The one sentence an under-18 sees, everywhere.
export const UNDERAGE_MESSAGE = 'You need to be 18 or older to create an account. A parent or guardian can book for you.'
