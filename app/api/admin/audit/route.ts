import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { requireStaff } from '@/lib/staff-auth'

export const dynamic = 'force-dynamic'

// GET /api/admin/audit — append-only audit log (owner only).
// Optional filters: ?staffId=&action=&limit=
export async function GET(req: NextRequest) {
  const g = requireStaff(req, 'audit.view')
  if (g instanceof NextResponse) return g

  const url = new URL(req.url)
  const staffId = url.searchParams.get('staffId')
  const action = url.searchParams.get('action')
  const limit = Math.min(Number(url.searchParams.get('limit') ?? 200) || 200, 500)

  let q = supabaseAdmin()
    .from('staff_audit_log')
    .select('id, staff_name, action, entity_type, entity_id, amount_cents, details, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (staffId) q = q.eq('staff_user_id', staffId)
  if (action) q = q.eq('action', action)

  const { data, error } = await q
  if (error) return NextResponse.json({ error: 'Could not load the audit log.' }, { status: 500 })
  return NextResponse.json({ entries: data ?? [] })
}
