import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { PROP_COLUMNS } from '@/lib/props'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { fetch: (input, init) => fetch(input as RequestInfo, { ...init, cache: 'no-store' }) } }
)

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

// GET /api/props — public directory of active props (client filters by category).
export async function GET(_req: NextRequest) {
  const { data, error } = await supabase
    .from('props')
    .select(PROP_COLUMNS)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Distinct categories that actually have active props, for the filter bar.
  const categories = Array.from(new Set((data ?? []).map(p => p.category).filter(Boolean)))

  return NextResponse.json({ props: data ?? [], categories })
}
