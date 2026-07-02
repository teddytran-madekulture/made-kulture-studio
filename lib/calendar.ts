// Calendar link helpers — turn a booking window into an "Add to Calendar"
// Google URL and a downloadable .ics file. Used by the confirmation email,
// the checkout success screen, and the account bookings page.

export interface CalEvent {
  title: string
  startISO: string   // any parseable ISO (e.g. 2026-07-02T14:00:00-05:00)
  endISO: string
  location?: string
  details?: string
}

// ISO instant -> compact UTC stamp: 20260702T190000Z
function utcStamp(iso: string): string {
  const d = new Date(iso)
  return d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

// One-tap Google Calendar "template" link (prefilled new-event).
export function googleCalUrl(e: CalEvent): string {
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: e.title,
    dates: `${utcStamp(e.startISO)}/${utcStamp(e.endISO)}`,
  })
  if (e.details) p.set('details', e.details)
  if (e.location) p.set('location', e.location)
  return `https://calendar.google.com/calendar/render?${p.toString()}`
}

// Escape per RFC 5545 (commas, semicolons, backslashes, newlines).
function ics(s: string): string {
  return (s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n')
}

// Full .ics document for Apple Calendar / Outlook / etc.
export function icsContent(e: CalEvent, uid: string): string {
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Made Kulture//Booking//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${utcStamp(new Date().toISOString())}`,
    `DTSTART:${utcStamp(e.startISO)}`,
    `DTEND:${utcStamp(e.endISO)}`,
    `SUMMARY:${ics(e.title)}`,
    ...(e.location ? [`LOCATION:${ics(e.location)}`] : []),
    ...(e.details ? [`DESCRIPTION:${ics(e.details)}`] : []),
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n')
}

export const STUDIO_ADDRESS = '4825 Gulf Freeway, Houston TX 77023'
