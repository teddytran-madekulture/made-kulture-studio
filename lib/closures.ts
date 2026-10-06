// Studio closures — time off and blocked time (migration 143, 2026-10-06).
//
// Two sources, one shape:
//   studio_closures          one-off windows (whole studio, or chosen sets)
//   studio_holiday_closures  yearly holidays; the DATES are computed here, the
//                            table only says which are on and which years skip
//
// Every customer-facing booking path asks this file through
// lib/set-availability.ts, so a closed hour cannot be sold by a side door
// (checkout, reschedule, Plus instant-book, short-notice approve). The grid
// (/api/availability) and kiosk ADD TIME (setHeadroom) read it too.
// Admin create/edit deliberately does NOT — booking over your own closure is
// an allowed, deliberate act.
import type { SupabaseClient } from '@supabase/supabase-js'
import { centralOffset } from '@/lib/booking-times'

export interface Closure {
  id: string                    // closure uuid, or `holiday:<key>:<date>`
  kind: 'closure' | 'holiday'
  startISO: string
  endISO: string
  setIds: string[] | null       // null = whole studio
  publicLabel: string | null    // safe to show customers
  note: string | null           // admin only
  holidayKey?: string
  date?: string                 // holidays: the Central date
}

// ── Holiday date math ────────────────────────────────────────────────────────
const pad = (n: number) => String(n).padStart(2, '0')
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`

// nth weekday (0=Sun) of a month; n = -1 means the last one.
function nthWeekday(y: number, m: number, weekday: number, n: number): string {
  if (n > 0) {
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay()
    const day = 1 + ((weekday - first + 7) % 7) + (n - 1) * 7
    return ymd(y, m, day)
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate()
  const lastDow = new Date(Date.UTC(y, m - 1, lastDay)).getUTCDay()
  return ymd(y, m, lastDay - ((lastDow - weekday + 7) % 7))
}

// Western (Gregorian) Easter — anonymous Gregorian algorithm.
export function easterDate(y: number): string {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25)
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7
  const m = Math.floor((a + 11 * h + 22 * l) / 451)
  const month = Math.floor((h + l - 7 * m + 114) / 31)
  const day = ((h + l - 7 * m + 114) % 31) + 1
  return ymd(y, month, day)
}

export const HOLIDAYS: { key: string; label: string; dateFor: (y: number) => string }[] = [
  { key: 'new_years_day', label: "New Year's Day",  dateFor: y => ymd(y, 1, 1) },
  { key: 'easter',        label: 'Easter Sunday',   dateFor: easterDate },
  { key: 'memorial_day',  label: 'Memorial Day',    dateFor: y => nthWeekday(y, 5, 1, -1) },
  { key: 'july_4',        label: 'Fourth of July',  dateFor: y => ymd(y, 7, 4) },
  { key: 'labor_day',     label: 'Labor Day',       dateFor: y => nthWeekday(y, 9, 1, 1) },
  { key: 'thanksgiving',  label: 'Thanksgiving',    dateFor: y => nthWeekday(y, 11, 4, 4) },
  { key: 'christmas_eve', label: 'Christmas Eve',   dateFor: y => ymd(y, 12, 24) },
  { key: 'christmas',     label: 'Christmas Day',   dateFor: y => ymd(y, 12, 25) },
  { key: 'new_years_eve', label: "New Year's Eve",  dateFor: y => ymd(y, 12, 31) },
]

// Next calendar date as YYYY-MM-DD (pure date math, no timezone).
export function nextDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + 1))
  return ymd(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate())
}

// A whole Central day: local midnight → next local midnight (DST-correct).
export function fullDayWindow(date: string): { startISO: string; endISO: string } {
  const next = nextDate(date)
  return {
    startISO: new Date(`${date}T00:00:00${centralOffset(date, 0)}`).toISOString(),
    endISO:   new Date(`${next}T00:00:00${centralOffset(next, 0)}`).toISOString(),
  }
}

const centralYear = (iso: string) =>
  Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric' }).format(new Date(iso)))

// A missing table (migration not run yet) must not take checkout down with it;
// every other error throws, because "no closures" from a broken query is the
// silent-failure pattern this project keeps paying for.
const isMissingTable = (e: any) =>
  e?.code === '42P01' || e?.code === 'PGRST205' || /does not exist|schema cache/i.test(e?.message ?? '')

export async function activeClosures(
  supabase: SupabaseClient,
  startISO: string,
  endISO: string,
): Promise<Closure[]> {
  const [{ data: rows, error: cErr }, { data: hols, error: hErr }] = await Promise.all([
    supabase.from('studio_closures')
      .select('id, starts_at, ends_at, set_ids, note, public_label')
      .lt('starts_at', endISO).gt('ends_at', startISO),
    supabase.from('studio_holiday_closures').select('key, enabled, skip_dates'),
  ])
  if (cErr) {
    if (isMissingTable(cErr)) { console.error('[closures] studio_closures missing — run migration 143'); }
    else throw new Error(`closure lookup failed: ${cErr.message}`)
  }
  if (hErr && !isMissingTable(hErr)) throw new Error(`holiday lookup failed: ${hErr.message}`)

  const out: Closure[] = (cErr ? [] : rows ?? []).map((r: any) => ({
    id: r.id, kind: 'closure' as const,
    startISO: new Date(r.starts_at).toISOString(), endISO: new Date(r.ends_at).toISOString(),
    setIds: r.set_ids && r.set_ids.length ? r.set_ids : null,
    publicLabel: r.public_label ?? null, note: r.note ?? null,
  }))

  const on = new Map<string, string[]>()
  for (const h of (hErr ? [] : hols ?? []) as any[]) if (h.enabled) on.set(h.key, (h.skip_dates ?? []).map(String))
  if (on.size) {
    const s = Date.parse(startISO), e = Date.parse(endISO)
    for (let y = centralYear(startISO); y <= centralYear(endISO); y++) {
      for (const h of HOLIDAYS) {
        const skips = on.get(h.key)
        if (!skips) continue
        const date = h.dateFor(y)
        if (skips.includes(date)) continue
        const w = fullDayWindow(date)
        if (Date.parse(w.startISO) < e && Date.parse(w.endISO) > s) {
          out.push({
            id: `holiday:${h.key}:${date}`, kind: 'holiday', ...w, setIds: null,
            publicLabel: `Closed for ${h.label}`, note: null, holidayKey: h.key, date,
          })
        }
      }
    }
  }
  return out.sort((a, b) => Date.parse(a.startISO) - Date.parse(b.startISO))
}

// Does this closure block the given set? setId null = a full buyout, which
// needs every set, so ANY closure blocks it.
export function closureBlocks(c: Closure, setId: string | null): boolean {
  if (!c.setIds) return true
  if (!setId) return true
  return c.setIds.includes(setId)
}

// What a customer is told. Never the private note.
export function closureReason(c: Closure, setName?: string): string {
  const what = c.publicLabel?.trim()
  if (c.setIds && setName) return `${setName} is closed during that time${what ? ` (${what})` : ''}.`
  return what ? `The studio is closed then (${what}).` : 'The studio is closed during that time.'
}
