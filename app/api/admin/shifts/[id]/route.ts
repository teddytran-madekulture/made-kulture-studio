import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { SHIFT_MEDIA_BUCKET } from '@/lib/shifts'

export const dynamic = 'force-dynamic'

// Wipe a shift's work state (clock stamps + closeout photos) when it's freed for
// reassignment, so the next worker starts clean and no orphan worked-time lingers.
async function clearWorkState(shiftId: string) {
  const admin = supabaseAdmin()
  const { data: rows } = await admin.from('shift_photos').select('id, storage_path').eq('shift_id', shiftId)
  const paths = (rows ?? []).map((r: any) => r.storage_path).filter(Boolean)
  if (paths.length) await admin.storage.from(SHIFT_MEDIA_BUCKET).remove(paths)
  await admin.from('shift_photos').delete().eq('shift_id', shiftId)
}

// PATCH /api/admin/shifts/[id] — { action: 'cancel' | 'uncancel' | 'release' } and/or { notes }.
//   cancel   → soft-cancel (drops off worker boards, kept for the record)
//   uncancel → restore a cancelled shift
//   release  → free a claimed shift back to open (worker unassigned; clock + photos reset)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }) }

  const now = new Date().toISOString()
  const updates: Record<string, any> = { updated_at: now }
  if (b.action === 'cancel') updates.cancelled_at = now
  else if (b.action === 'uncancel') updates.cancelled_at = null
  else if (b.action === 'release') { updates.claimed_by = null; updates.claimed_at = null; updates.clock_in_at = null; updates.clock_out_at = null }
  if (typeof b.notes === 'string') updates.notes = b.notes.trim()

  if (Object.keys(updates).length === 1) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })

  if (b.action === 'release') await clearWorkState(params.id)

  const { error } = await supabaseAdmin().from('shifts').update(updates).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE /api/admin/shifts/[id] — remove a shift entirely (closeout photos cascade
// via FK; also purge their storage objects so nothing is orphaned).
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  await clearWorkState(params.id)
  const { error } = await supabaseAdmin().from('shifts').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
