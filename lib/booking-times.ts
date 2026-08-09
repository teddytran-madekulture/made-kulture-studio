// Admin and booking surfaces collect a session as ONE date plus two DECIMAL
// HOURS (20.5 = 8:30 PM) — that is what the time <select>s emit. These build the
// stored timestamps from that pair.
//
// Two things this file exists to get right:
//
// 1. HALF HOURS. The manual-create routes used to build their ISO with
//    `String(hour).padStart(2,'0') + ':00:00'`, which silently produced
//    `2026-08-09T20.5:00:00-05:00` — an invalid timestamp — the moment a half
//    hour was sent.
//
// 2. DAYLIGHT SAVING. Every booking write in this app used to hardcode a
//    `-05:00` offset. That is Central DAYLIGHT time and is only true from
//    mid-March to early November. From the first Sunday in November the studio
//    is on CST (-06:00), so a 2 PM booking was stored as the instant Chicago
//    calls 1 PM, and every screen that renders it in America/Chicago showed it
//    an hour early. Door PINs would have been minted for the wrong hour too,
//    which locks a real guest out rather than merely looking wrong.
//
// The emitted SHAPE is deliberately unchanged — `YYYY-MM-DDTHH:MM:00±HH:MM`
// with the studio's wall-clock time in the middle. Some code reads the stored
// value positionally (`lib/booking-core.ts` `isoToHour` slices chars 11–13), so
// switching to a plain `...Z` instant would have broken it. Only the offset is
// now computed rather than assumed.

const STUDIO_TZ = 'America/Chicago'

// How far America/Chicago sits from UTC at a given instant, in minutes.
// -300 on CDT, -360 on CST. Intl carries the timezone database, so there is no
// DST rule to hardcode and nothing to update when Congress next moves the dates.
export function centralOffsetMinutesAt(at: Date): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: STUDIO_TZ, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(at).map(p => [p.type, p.value])
  ) as Record<string, string>
  const asUTC = Date.UTC(
    +parts.year, +parts.month - 1, +parts.day,
    +parts.hour % 24, +parts.minute, +parts.second,
  )
  return (asUTC - at.getTime()) / 60_000
}

function formatOffset(mins: number): string {
  const sign = mins <= 0 ? '-' : '+'
  const abs  = Math.abs(mins)
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`
}

// The offset the studio is actually on for a given LOCAL date and hour.
//
// Solved twice on purpose: the offset depends on the instant, and the instant
// depends on the offset. One pass from a naive guess lands in the right regime
// everywhere except within an hour of a transition; the second settles it.
//
// ⚠️ The one genuinely ambiguous case is the repeated hour on the fall-back
// morning (1:00–1:59 AM on the first Sunday in November happens twice). This
// resolves it to the first occurrence, i.e. CDT. Nothing else can be correct
// without asking which one the user meant.
export function centralOffset(date: string, hour: number): string {
  const [y, mo, d] = date.split('-').map(Number)
  const h  = Math.floor(hour)
  const mi = hour % 1 !== 0 ? 30 : 0
  const naive = Date.UTC(y, mo - 1, d, h, mi)
  let mins = centralOffsetMinutesAt(new Date(naive))
  mins = centralOffsetMinutesAt(new Date(naive - mins * 60_000))
  return formatOffset(mins)
}

export function bookingHourToISO(date: string, hour: number): string {
  const h = Math.floor(hour)
  const m = hour % 1 !== 0 ? '30' : '00'
  return `${date}T${String(h).padStart(2, '0')}:${m}:00${centralOffset(date, hour)}`
}

// An off-hours session can run past midnight (10 PM – 1 AM). The admin picks a
// single date, so an end at or before the start belongs to the NEXT calendar
// day. Without this the end timestamp lands before the start and the row is
// garbage — negative duration, and nothing downstream checks for it.
export function bookingEndISO(date: string, startHour: number, endHour: number): string {
  if (endHour > startHour) return bookingHourToISO(date, endHour)
  return bookingHourToISO(nextDay(date), endHour)
}

export function nextDay(date: string): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}

export function bookingSpanHours(startHour: number, endHour: number): number {
  return endHour <= startHour ? endHour + 24 - startHour : endHour - startHour
}
