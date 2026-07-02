import { NextRequest, NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { CREATIVE_ROLES } from '@/lib/roles'

export const dynamic = 'force-dynamic'

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/roles/suggest — record a custom "Other" role for owner review.
// Public + best-effort (called from signup before auth). De-dupes against the
// built-in list, approved roles, and existing pending suggestions.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({} as any))
  const role = String(body.role || '').trim().slice(0, 40)
  const email = body.email ? String(body.email).trim().slice(0, 200) : null
  if (!role || role.length < 2) return NextResponse.json({ error: 'Invalid role' }, { status: 400 })

  if (CREATIVE_ROLES.some(r => r.toLowerCase() === role.toLowerCase()))
    return NextResponse.json({ ok: true, skipped: 'builtin' })

  const { data: approved } = await service
    .from('directory_roles').select('role').ilike('role', role).maybeSingle()
  if (approved) return NextResponse.json({ ok: true, skipped: 'approved' })

  const { data: pending } = await service
    .from('role_suggestions').select('id').eq('status', 'pending').ilike('role', role).maybeSingle()
  if (pending) return NextResponse.json({ ok: true, skipped: 'pending' })

  const { error } = await service
    .from('role_suggestions').insert({ role, suggested_email: email, status: 'pending' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
