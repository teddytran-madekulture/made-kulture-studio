// Booking change log (migration 134) — every cancel / reschedule / release,
// with who did it and how much notice they gave. Feeds the late-change meter.
//
// ⚠️ NEVER throws and never blocks the change it records. A failed log line is
// a console error, not a failed cancellation. But it DOES check the insert
// result, because supabase-js reports failure in `error` rather than throwing
// (see silent-failure-pattern) — an unchecked insert would fail silently forever.
import type { SupabaseClient } from '@supabase/supabase-js'

export type BookingChangeKind = 'cancel' | 'reschedule' | 'release_credit'
export type BookingChangeActor = 'customer' | 'admin' | 'desk' | 'system'

export const LATE_CHANGE_HOURS = 48

export interface BookingChangeInput {
  bookingId: string
  kind: BookingChangeKind
  actor: BookingChangeActor
  via?: string | null
  /** The session's start BEFORE this change. hours_notice is measured from it. */
  oldStartISO: string | null | undefined
  newStartISO?: string | null
  authUserId?: string | null
  customerEmail?: string | null
  creditCents?: number | null
}

export function hoursNotice(oldStartISO: string | null | undefined, at = Date.now()): number | null {
  if (!oldStartISO) return null
  const t = new Date(oldStartISO).getTime()
  if (!Number.isFinite(t)) return null
  return Math.round(((t - at) / 3_600_000) * 100) / 100
}

export async function logBookingChange(service: SupabaseClient, input: BookingChangeInput): Promise<void> {
  try {
    const { error } = await service.from('booking_changes').insert({
      booking_id: input.bookingId,
      auth_user_id: input.authUserId ?? null,
      customer_email: input.customerEmail ? input.customerEmail.trim().toLowerCase() : null,
      kind: input.kind,
      actor: input.actor,
      via: input.via ?? null,
      old_start: input.oldStartISO ?? null,
      new_start: input.newStartISO ?? null,
      hours_notice: hoursNotice(input.oldStartISO),
      credit_cents: input.creditCents ?? null,
    })
    if (error) console.error('[booking-changes] log insert failed:', error.message, input.kind, input.bookingId)
  } catch (e) {
    console.error('[booking-changes] log insert threw:', e)
  }
}
