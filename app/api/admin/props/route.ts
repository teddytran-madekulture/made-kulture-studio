import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { PROP_COLUMNS, sanitizeProp, slugify } from '@/lib/props'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { global: { fetch: (input, init) => fetch(input as RequestInfo, { ...init, cache: 'no-store' }) } }
)

// Find a slug not already taken (base, base-2, base-3, ...).
async function uniqueSlug(base: string): Promise<string> {
  base = base || 'prop'
  const { data } = await supabase.from('props').select('slug').like('slug', base + '%')
  const taken = new Set((data ?? []).map((r: any) => r.slug))
  if (!taken.has(base)) return base
  let i = 2
  while (taken.has(`${base}-${i}`)) i++
  return `${base}-${i}`
}

// GET /api/admin/props — full catalog (active + hidden)
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase
    .from('props')
    .select(PROP_COLUMNS)
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ props: data ?? [] })
}

// POST /api/admin/props — add a prop
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const row = sanitizeProp(body)
  if (!row.name) return NextResponse.json({ error: 'Prop name is required' }, { status: 400 })
  if (!row.slug) row.slug = await uniqueSlug(slugify(String(row.name)))
  if (!row.gallery && row.image_url) row.gallery = [row.image_url]
  if (row.is_active === undefined) row.is_active = true
  const { data, error } = await supabase.from('props').insert(row).select(PROP_COLUMNS).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ prop: data })
}
