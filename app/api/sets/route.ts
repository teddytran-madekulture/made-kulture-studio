import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Public, read-only catalog of active sets for the customer /sets and /book
// pages. No auth — only active sets and display-safe fields are exposed.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const PUBLIC_COLUMNS =
  'id, slug, name, description, rate_per_hour, min_hours, capacity, features, photo_url, dimensions, category, accent_gradient, sort_order'

export const dynamic = 'force-dynamic'

// GET /api/sets — active sets only, ordered for display
export async function GET() {
  const { data, error } = await supabase
    .from('sets')
    .select(PUBLIC_COLUMNS)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sets: data ?? [] })
}
