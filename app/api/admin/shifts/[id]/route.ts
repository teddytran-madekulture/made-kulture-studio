import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// PATCH /api/admin/shifts/[id] — { action: 'cancel' | 'uncancel' | 'release' } and/or { notes }.
//   cancel   → soft-cancel (drops off worker boards, kept for the record)
//   uncancel → restore a cancelled shift
//   release  → free a claimed shift back to open (worker no longer assigned)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }) }

  const now = new Date().toISOString()
  const updates: Record<string, any> = { updated_at: now }
  if (b.action === 'cancel') updates.cancelled_at = now
  else if (b.action === 'uncancel') updates.cancelled_at = null
  else if (b.action === 'release') { updates.claimed_by = null; updates.claimed_at = null }
  if (typeof b.notes === 'string') updates.notes = b.notes.trim()

  if (Object.keys(updates).length === 1) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })

  const { error } = await supabaseAdmin().from('shifts').update(updates).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE /api/admin/shifts/[id] — remove a shift entirely.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { error } = await supabaseAdmin().from('shifts').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
