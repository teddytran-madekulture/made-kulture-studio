import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SET_COLUMNS = 'id, name, slug, description, rate_per_hour, min_hours, capacity, features, photo_url, dimensions, sort_order, category, accent_gradient, is_active, created_at'

// Normalize the editable fields from a request body into a clean row object.
// Only known columns are passed through, so callers can't write arbitrary keys.
function sanitizeSet(body: any) {
  const row: Record<string, unknown> = {}

  if (typeof body.name === 'string')        row.name        = body.name.trim()
  if (typeof body.slug === 'string')        row.slug        = body.slug.trim().toLowerCase()
  if (typeof body.description === 'string') row.description = body.description.trim()
  if (body.rate_per_hour !== undefined)     row.rate_per_hour = Number(body.rate_per_hour)
  if (body.min_hours !== undefined)         row.min_hours   = body.min_hours === null ? null : Number(body.min_hours)
  if (body.capacity !== undefined)          row.capacity    = parseInt(String(body.capacity), 10)
  if (typeof body.photo_url === 'string')   row.photo_url   = body.photo_url.trim()
  if (typeof body.dimensions === 'string')  row.dimensions  = body.dimensions.trim()
  if (body.sort_order !== undefined)        row.sort_order  = parseInt(String(body.sort_order), 10)
  if (typeof body.category === 'string')    row.category    = body.category.trim().toLowerCase()
  if (typeof body.accent_gradient === 'string') row.accent_gradient = body.accent_gradient.trim()
  if (body.is_active !== undefined)         row.is_active   = Boolean(body.is_active)

  // features may arrive as an array or a comma/newline-separated string
  if (body.features !== undefined) {
    if (Array.isArray(body.features)) {
      row.features = body.features.map((f: unknown) => String(f).trim()).filter(Boolean)
    } else if (typeof body.features === 'string') {
      row.features = body.features
        .split(/[\n,]/)
        .map((f: string) => f.trim())
        .filter(Boolean)
    }
  }

  return row
}

// GET /api/admin/sets — list every set (active + inactive), active first
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('sets')
    .select(SET_COLUMNS)
    .order('is_active', { ascending: false })
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ sets: data ?? [] })
}

// POST /api/admin/sets — create a new set
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const row  = sanitizeSet(body)

  if (!row.name) return NextResponse.json({ error: 'Set name is required' }, { status: 400 })
  if (row.rate_per_hour === undefined || isNaN(row.rate_per_hour as number)) {
    return NextResponse.json({ error: 'A valid hourly rate is required' }, { status: 400 })
  }

  // Sensible defaults for anything not supplied
  if (row.capacity === undefined || isNaN(row.capacity as number)) row.capacity = 5
  if (row.min_hours === undefined) row.min_hours = 1
  if (row.features === undefined) row.features = []
  if (row.is_active === undefined) row.is_active = true

  const { data, error } = await supabase
    .from('sets')
    .insert(row)
    .select(SET_COLUMNS)
    .single()

  if (error) {
    // Unique-name violation
    if (error.code === '23505') {
      return NextResponse.json({ error: `A set named "${row.name}" already exists.` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ set: data })
}
