import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const STATUSES = ['applicant', 'active', 'inactive']

// PATCH /api/admin/workers/[id] — update a worker's status (applicant → active
// once screened, or → inactive to deactivate) and/or set a display name.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }) }

  const updates: Record<string, any> = { updated_at: new Date().toISOString() }
  if (typeof b.status === 'string' && STATUSES.includes(b.status)) updates.status = b.status
  if (typeof b.full_name === 'string') updates.full_name = b.full_name.trim() || null

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }
  const { error } = await supabaseAdmin().from('worker_profiles').update(updates).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
