import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { CREATIVE_ROLES } from '@/lib/roles'

export const dynamic = 'force-dynamic'

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/roles — the effective creative-role list: the built-in list plus any
// owner-approved custom roles. Public (used on the signup + profile forms).
export async function GET() {
  let extra: string[] = []
  try {
    const { data } = await service.from('directory_roles').select('role').order('role')
    extra = (data ?? []).map((r: any) => r.role).filter(Boolean)
  } catch {
    // directory_roles may not exist yet (pre-migration) — fall back to base list.
  }
  const base = [...CREATIVE_ROLES]
  const seen = new Set(base.map(r => r.toLowerCase()))
  const roles = [...base, ...extra.filter(r => !seen.has(r.toLowerCase()))]
  return NextResponse.json({ roles })
}
