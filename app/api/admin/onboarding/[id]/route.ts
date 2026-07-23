import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

// PATCH /api/admin/onboarding/[id] — edit a module IN PLACE (typo/fix) or toggle
// active. For a rule change that should force re-certification, POST a new version
// instead of patching.
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }) }

  const updates: Record<string, any> = { updated_at: new Date().toISOString() }
  if (typeof b.active === 'boolean') updates.active = b.active
  if (typeof b.title === 'string') updates.title = b.title
  if (typeof b.body === 'string') updates.body = b.body
  if (Array.isArray(b.required_for)) updates.required_for = b.required_for
  if (b.quiz && typeof b.quiz === 'object') updates.quiz = b.quiz
  if (b.sort_order != null) updates.sort_order = Number(b.sort_order)

  if (Object.keys(updates).length === 1) {
    return NextResponse.json({ error: 'Nothing to update.' }, { status: 400 })
  }
  const { error } = await supabaseAdmin().from('onboarding_modules').update(updates).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
