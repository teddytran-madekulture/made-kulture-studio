// GIGS (migration 185, 2026-11-21) — shared, dependency-free pieces used by
// both the API routes and the client pages. Server-only work (alerts, emails,
// pushes) lives in lib/gigs-server.ts.

export type GigStatus = 'pending' | 'live' | 'declined' | 'pulled' | 'filled' | 'closed'

export const GIG_STATUS_LABEL: Record<GigStatus, string> = {
  pending: 'Waiting for approval',
  live: 'Live',
  declined: 'Declined',
  pulled: 'Pulled for review',
  filled: 'Filled',
  closed: 'Closed',
}

/** Who may self-post. Creatives answer gigs; brands and vendors post them. */
export const GIG_POSTER_TYPES = ['brand', 'vendor'] as const

/** How long a gig stays up when it has no apply-by date. */
export const GIG_DEFAULT_DAYS = 30
/** Active (pending + live) gigs one account may have at once. */
export const GIG_ACTIVE_CAP = 5
/** Distinct member reports that pull a live gig until Teddy reviews it. */
export const GIG_AUTO_PULL_AT = 3

export const GIG_REPORT_REASONS = ['pay_to_apply', 'scam', 'not_paid', 'inappropriate', 'other'] as const
export const GIG_REPORT_LABEL: Record<string, string> = {
  pay_to_apply: 'Asks me to pay',
  scam: 'Looks like a scam',
  not_paid: 'Not actually paid',
  inappropriate: 'Inappropriate',
  other: 'Other',
}

/** The line every gig carries. */
export const GIG_SAFETY_LINE = 'Made Kulture never asks you to pay to apply. Never send money, ID or bank details to get a gig. Report anything that does.'

/** The poster agreement, accepted on the post form. */
export const GIG_POSTER_TERMS = [
  'This is real, paid work and the pay shown is what the person hired will receive.',
  'I will never ask an applicant to pay, buy anything, or send ID or bank details to get this gig.',
  'Made Kulture only connects us. It is not a party to any deal, does not handle payment, and is not responsible for the work.',
  'Made Kulture may edit, pull or remove this gig at any time.',
]

/** 'YYYY-MM-DD' -> "Sat, Dec 5". Read as a calendar date, never shifted by time zone. */
export function gigDateLabel(d: string | null | undefined): string {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return ''
  const [y, m, day] = d.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, day, 12)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' })
}

/** Today in Houston as 'YYYY-MM-DD'. */
export function centralToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

/** When a gig comes down: end of its apply-by day in Houston (~11:59 PM), else 30 days. */
export function gigExpiry(applyBy: string | null | undefined, from = new Date()): string {
  if (applyBy && /^\d{4}-\d{2}-\d{2}$/.test(applyBy)) {
    // 05:59 UTC next day = 11:59 PM CST; during CDT it is 12:59 AM. Close enough for a board.
    const [y, m, d] = applyBy.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, d + 1, 5, 59)).toISOString()
  }
  return new Date(from.getTime() + GIG_DEFAULT_DAYS * 24 * 60 * 60 * 1000).toISOString()
}

export function isLiveGig(g: { status: string; expires_at: string | null }): boolean {
  return g.status === 'live' && (!g.expires_at || new Date(g.expires_at) > new Date())
}
