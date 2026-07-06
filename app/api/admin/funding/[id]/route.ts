import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const STATUSES = ['not_started', 'researching', 'preparing', 'applied', 'approved', 'declined']

// PATCH /api/admin/funding/[id] — update status / next_action / notes / fields.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }) }

  const updates: Record<string, any> = { updated_at: new Date().toISOString() }
  if (typeof b.status === 'string' && STATUSES.includes(b.status)) updates.status = b.status
  if (typeof b.next_action === 'string') updates.next_action = b.next_action
  if (typeof b.notes === 'string') updates.notes = b.notes
  if (typeof b.name === 'string' && b.name.trim()) updates.name = b.name.trim()
  if (typeof b.type === 'string') updates.type = b.type
  if (typeof b.amount === 'string') updates.amount = b.amount
  if (typeof b.deadline === 'string') updates.deadline = b.deadline
  if (typeof b.url === 'string') updates.url = b.url
  if (b.fit != null && b.fit !== '') updates.fit = Math.max(1, Math.min(5, Math.round(Number(b.fit))))

  if (Object.keys(updates).length === 1) return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })

  const { error } = await supabaseAdmin().from('funding_opportunities').update(updates).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// DELETE /api/admin/funding/[id] — remove an opportunity.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { error } = await supabaseAdmin().from('funding_opportunities').delete().eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
