import { NextResponse } from 'next/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { CREATIVE_ROLES } from '@/lib/roles'

export const dynamic = 'force-dynamic'

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/roles — the effective creative-role list: the built-in list plus any
// owner-approved custom roles, MINUS any the owner has hidden. Public (used on
// the signup + profile forms and the directory filter).
export async function GET() {
  let extra: string[] = []
  let hidden: string[] = []
  try {
    const [ex, hi] = await Promise.all([
      service.from('directory_roles').select('role').order('role'),
      service.from('hidden_roles').select('role'),
    ])
    extra = (ex.data ?? []).map((r: any) => r.role).filter(Boolean)
    hidden = (hi.data ?? []).map((r: any) => r.role).filter(Boolean)
  } catch {
    // tables may not exist yet (pre-migration) — fall back to the base list.
  }
  const base = [...CREATIVE_ROLES]
  const seen = new Set(base.map(r => r.toLowerCase()))
  const merged = [...base, ...extra.filter(r => !seen.has(r.toLowerCase()))]
  const hiddenSet = new Set(hidden.map(r => r.toLowerCase()))
  const roles = merged.filter(r => !hiddenSet.has(r.toLowerCase()))
  return NextResponse.json({ roles })
}
