import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/admin/role-suggestions — pending custom roles awaiting review.
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase
    .from('role_suggestions')
    .select('id, role, suggested_email, created_at')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ suggestions: data ?? [] })
}

// POST { id, action: 'approve' | 'dismiss' }
//   approve → add the role to directory_roles (becomes a standard chip everywhere)
//   dismiss → just mark it resolved
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({} as any))
  const id = String(body.id || '')
  const action = String(body.action || '')
  if (!id || (action !== 'approve' && action !== 'dismiss'))
    return NextResponse.json({ error: 'Invalid request' }, { status: 400 })

  const { data: row } = await supabase
    .from('role_suggestions').select('role').eq('id', id).maybeSingle()
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (action === 'approve') {
    await supabase.from('directory_roles').upsert({ role: row.role }, { onConflict: 'role' })
  }
  await supabase.from('role_suggestions')
    .update({ status: action === 'approve' ? 'approved' : 'dismissed', resolved_at: new Date().toISOString() })
    .eq('id', id)
  return NextResponse.json({ ok: true })
}
