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

// GET /api/props/[slug] — single active prop (with gallery) for the detail page.
export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const { data, error } = await supabase
    .from('props')
    .select(PROP_COLUMNS)
    .eq('slug', params.slug)
    .eq('is_active', true)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ prop: data })
}
