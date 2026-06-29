import { supabaseAdmin } from '@/lib/supabase'
import type { StaffContext } from '@/lib/staff-auth'

// Append-only audit logging. Call on every mutating staff action (booking
// create/modify/cancel, add-ons, terminal checkout, refunds, overages, staff
// changes). Never throws — a logging failure must not break the underlying op.
export async function audit(
  staff: StaffContext,
  action: string,
  opts: {
    entityType?: string
    entityId?: string
    amountCents?: number
    details?: Record<string, unknown>
  } = {}
): Promise<void> {
  try {
    await supabaseAdmin().from('staff_audit_log').insert({
      staff_user_id: staff.staffId,
      staff_name: staff.name,
      action,
      entity_type: opts.entityType ?? null,
      entity_id: opts.entityId ?? null,
      amount_cents: opts.amountCents ?? null,
      details: opts.details ?? null,
    })
  } catch (e) {
    console.error('[audit] failed to write audit row', action, e)
  }
}
