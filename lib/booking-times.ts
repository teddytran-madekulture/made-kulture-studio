// Admin surfaces collect a session as ONE date plus two DECIMAL HOURS
// (20.5 = 8:30 PM) — that is what the dashboard's <select>s emit. These build
// the stored timestamps from that pair.
//
// The dashboard used to send whole hours only, and both manual-create routes
// built their ISO with `String(hour).padStart(2,'0') + ':00:00'`. That silently
// produced `2026-08-09T20.5:00:00-05:00` — an invalid timestamp — the moment a
// half hour was sent, so the widened time pickers must go through here.
//
// ⚠️ The -05:00 offset is Central DAYLIGHT time, hardcoded to match every other
// booking write in this app (app/admin/dashboard/page.tsx, lib/extensions.ts).
// It is an hour off for bookings created between early November and mid-March.
// Fixing it is a separate, app-wide change — do NOT fix it here alone, or the
// admin's writes would disagree with everything else that reads them.

export function bookingHourToISO(date: string, hour: number): string {
  const h = Math.floor(hour)
  const m = hour % 1 !== 0 ? '30' : '00'
  return `${date}T${String(h).padStart(2, '0')}:${m}:00-05:00`
}

// An off-hours session can run past midnight (10 PM – 1 AM). The admin picks a
// single date, so an end at or before the start belongs to the NEXT calendar
// day. Without this the end timestamp lands before the start and the row is
// garbage — negative duration, and nothing downstream checks for it.
export function bookingEndISO(date: string, startHour: number, endHour: number): string {
  if (endHour > startHour) return bookingHourToISO(date, endHour)
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return bookingHourToISO(d.toISOString().slice(0, 10), endHour)
}

export function bookingSpanHours(startHour: number, endHour: number): number {
  return endHour <= startHour ? endHour + 24 - startHour : endHour - startHour
}
