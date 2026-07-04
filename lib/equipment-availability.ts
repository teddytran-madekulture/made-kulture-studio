import { SupabaseClient } from '@supabase/supabase-js'

// Bookings in these states hold equipment; cancelled/completed do not reserve gear.
// 'pending_payment' = delegated ("someone else pays") hold — reserves gear during
// the payment window so a held booking's equipment can't be double-booked.
const ACTIVE_STATUSES = ['confirmed', 'pending', 'pending_payment']

/**
 * Sum the equipment units reserved across all active bookings that overlap the
 * given time window. Two intervals overlap when start < otherEnd && end > otherStart.
 *
 * @returns Record of equipment_id → reserved quantity (only items with > 0 appear)
 */
export async function getReservedQuantities(
  supabase: SupabaseClient,
  startISO: string,
  endISO: string,
  opts: { equipmentIds?: string[]; excludeBookingId?: string } = {}
): Promise<Record<string, number>> {
  let query = supabase
    .from('booking_add_ons')
    .select('equipment_id, quantity, booking_id, bookings!inner(start_time, end_time, status)')
    .lt('bookings.start_time', endISO)
    .gt('bookings.end_time', startISO)
    .in('bookings.status', ACTIVE_STATUSES)

  if (opts.equipmentIds && opts.equipmentIds.length) {
    query = query.in('equipment_id', opts.equipmentIds)
  }
  if (opts.excludeBookingId) {
    query = query.neq('booking_id', opts.excludeBookingId)
  }

  const { data, error } = await query
  if (error) {
    console.error('[equipment-availability] query error:', error)
    throw error
  }

  const reserved: Record<string, number> = {}
  for (const row of data ?? []) {
    if (!row.equipment_id) continue
    reserved[row.equipment_id] = (reserved[row.equipment_id] ?? 0) + (row.quantity ?? 1)
  }
  return reserved
}

/**
 * Given the equipment catalog (id → owned quantity) and reserved counts,
 * return how many units of each item are still available for the window.
 */
export function computeAvailable(
  owned: Record<string, number>,
  reserved: Record<string, number>
): Record<string, number> {
  const available: Record<string, number> = {}
  for (const id of Object.keys(owned)) {
    available[id] = Math.max(0, (owned[id] ?? 0) - (reserved[id] ?? 0))
  }
  return available
}

/**
 * Validate a requested equipment cart against availability for a time window.
 * `requested` is a map of equipment_id → quantity wanted.
 * Returns { ok } or { ok:false, conflicts } listing items that can't be fulfilled.
 */
export async function checkCartAvailability(
  supabase: SupabaseClient,
  startISO: string,
  endISO: string,
  requested: Record<string, number>,
  excludeBookingId?: string
): Promise<{ ok: true } | { ok: false; conflicts: { equipmentId: string; name: string; requested: number; available: number }[] }> {
  const ids = Object.keys(requested).filter(id => (requested[id] ?? 0) > 0)
  if (ids.length === 0) return { ok: true }

  // Owned quantities + names for the requested items
  const { data: items, error } = await supabase
    .from('equipment')
    .select('id, name, quantity, is_available')
    .in('id', ids)
  if (error) throw error

  const reserved = await getReservedQuantities(supabase, startISO, endISO, { equipmentIds: ids, excludeBookingId })

  const conflicts: { equipmentId: string; name: string; requested: number; available: number }[] = []
  for (const item of items ?? []) {
    const want = requested[item.id] ?? 0
    const owned = item.is_available ? (item.quantity ?? 0) : 0
    const avail = Math.max(0, owned - (reserved[item.id] ?? 0))
    if (want > avail) {
      conflicts.push({ equipmentId: item.id, name: item.name, requested: want, available: avail })
    }
  }
  // Any requested id that no longer exists in the catalog is also a conflict.
  const foundIds = new Set((items ?? []).map(i => i.id))
  for (const id of ids) {
    if (!foundIds.has(id)) conflicts.push({ equipmentId: id, name: 'Unknown item', requested: requested[id], available: 0 })
  }

  return conflicts.length ? { ok: false, conflicts } : { ok: true }
}
