import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireStaff } from '@/lib/staff-auth'
import { deleteAcuityBlocks } from '@/lib/acuity-sync'
import { deleteCalendarEvent } from '@/lib/gcal'
import { audit } from '@/lib/audit'

export const dynamic = 'force-dynamic'

// POST /api/desk/bookings/[id]/cancel  { reason? }
// Cancels a booking (status → cancelled) and removes any Acuity blocks it
// created, same as the admin cancel. Attributed to the signed-in staff + audited.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const g = requireStaff(req, 'booking.cancel')
  if (g instanceof NextResponse) return g

  let body: { reason?: string } = {}
  try { body = await req.json() } catch { /* reason optional */ }

  const db = supabaseAdmin()
  const { data: existing } = await db
    .from('bookings')
    .select('id, status, acuity_block_ids, gcal_event_id, total_amount, customers ( name )')
    .eq('id', params.id)
    .maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Booking not found.' }, { status: 404 })
  if (existing.status === 'cancelled') return NextResponse.json({ error: 'Already cancelled.' }, { status: 400 })

  const updates: Record<string, any> = { status: 'cancelled' }
  const blockIds = Array.isArray(existing.acuity_block_ids) ? existing.acuity_block_ids : []
  if (blockIds.length) {
    try { await deleteAcuityBlocks(blockIds) } catch (e) { console.error('[desk cancel] acuity block delete failed', e) }
    updates.acuity_block_ids = []
  }
  if ((existing as any).gcal_event_id) {
    try { await deleteCalendarEvent((existing as any).gcal_event_id) } catch (e) { console.error('[desk cancel] gcal delete failed', e) }
    updates.gcal_event_id = null
  }

  const { error } = await db.from('bookings').update(updates).eq('id', params.id)
  if (error) return NextResponse.json({ error: 'Could not cancel the booking.' }, { status: 500 })

  await audit(g, 'booking.cancel', {
    entityType: 'booking',
    entityId: params.id,
    details: { reason: body.reason ?? null, customer: (existing.customers as any)?.name ?? null },
  })

  // NOTE: this does not auto-refund. Refunds are gated (manager+) and handled
  // separately in Phase 4 so cancelling never silently moves money.
  return NextResponse.json({ success: true })
}
