import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { getReservedQuantities } from '@/lib/equipment-availability'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const COLUMNS = 'id, name, rate, category, quantity, description, image_url, gallery, sort_order, is_available, allow_offsite, deposit, created_at'
const CATEGORIES = ['lighting', 'modifier', 'special_effects', 'camera']

function sanitize(body: any) {
  const row: Record<string, unknown> = {}
  if (typeof body.name === 'string')        row.name        = body.name.trim()
  if (typeof body.description === 'string') row.description = body.description.trim()
  if (typeof body.image_url === 'string')   row.image_url   = body.image_url.trim()
  if (Array.isArray(body.gallery))          row.gallery     = body.gallery.filter((u: any) => typeof u === 'string')
  if (body.rate !== undefined)              row.rate        = Number(body.rate)
  if (body.quantity !== undefined)          row.quantity    = parseInt(String(body.quantity), 10)
  if (body.sort_order !== undefined)        row.sort_order  = parseInt(String(body.sort_order), 10)
  if (body.deposit !== undefined)           row.deposit     = Number(body.deposit)
  if (body.is_available !== undefined)      row.is_available = Boolean(body.is_available)
  if (body.allow_offsite !== undefined)     row.allow_offsite = Boolean(body.allow_offsite)
  if (typeof body.category === 'string' && CATEGORIES.includes(body.category)) row.category = body.category
  return row
}

// GET /api/admin/equipment — full catalog + how many of each is in use right now
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('equipment')
    .select(COLUMNS)
    .order('category', { ascending: true })
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // In-use-right-now = active bookings currently spanning this instant
  const now = new Date().toISOString()
  let inUseNow: Record<string, number> = {}
  try {
    inUseNow = await getReservedQuantities(supabase, now, now)
  } catch { /* non-fatal — show catalog without live counts */ }

  const equipment = (data ?? []).map(e => ({
    ...e,
    in_use_now: inUseNow[e.id] ?? 0,
    available_now: Math.max(0, (e.quantity ?? 0) - (inUseNow[e.id] ?? 0)),
  }))

  return NextResponse.json({ equipment })
}

// POST /api/admin/equipment — add a new item
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const row  = sanitize(body)

  if (!row.name) return NextResponse.json({ error: 'Equipment name is required' }, { status: 400 })
  if (row.rate === undefined || isNaN(row.rate as number)) {
    return NextResponse.json({ error: 'A valid rate is required' }, { status: 400 })
  }
  if (!row.category) return NextResponse.json({ error: 'A valid category is required' }, { status: 400 })
  if (row.quantity === undefined || isNaN(row.quantity as number)) row.quantity = 1
  if (row.is_available === undefined) row.is_available = true

  const { data, error } = await supabase.from('equipment').insert(row).select(COLUMNS).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ equipment: data })
}
