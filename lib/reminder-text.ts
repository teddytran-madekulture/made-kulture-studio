// The reminder TEXT — one wording for the 1pm day-before run (cron/reminders)
// and the admin "TEXT CHECK-IN LINK" button (2026-10-02). Plain text: lib/sms
// strips anything outside GSM-7, so emoji here would only be thrown away.
import { centralDateStr, centralHourDecimal } from '@/lib/booking-times'
import { formatDateLabel, formatTimeLabel } from '@/lib/email'
import { doorCodeLinkLine } from '@/lib/igloohome'

export function reminderText(opts: {
  name?: string | null
  setName?: string | null
  startISO: string
  endISO: string
  checkInToken?: string | null
  now?: Date
}): string {
  const now = opts.now ?? new Date()
  const today = centralDateStr(now.toISOString())
  const tomorrow = new Date(Date.parse(`${today}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
  const day = centralDateStr(opts.startISO)
  const when = day === today ? 'today' : day === tomorrow ? 'tomorrow' : `on ${formatDateLabel(day)}`
  const first = String(opts.name ?? '').trim().split(/\s+/)[0]
  return [
    `Made Kulture reminder: ${first ? `${first}, see` : 'See'} you ${when}.`,
    `${opts.setName || 'Full Studio Takeover'} - ${formatDateLabel(day)}, ${formatTimeLabel(centralHourDecimal(opts.startISO))}-${formatTimeLabel(centralHourDecimal(opts.endISO))}`,
    ``,
    doorCodeLinkLine(opts.checkInToken),
    ``,
    `No early arrivals. 4825 Gulf Freeway, Houston TX 77023`,
    `Reply STOP to opt out.`,
  ].join('\n')
}
