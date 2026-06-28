import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const COLUMNS = 'id, name, rate, category, quantity, description, image_url, sort_order, is_available, allow_offsite, deposit, created_at'
const CATEGORIES = ['lighting', 'modifier', 'special_effects', 'camera']

function sanitize(body: any) {
  const row: Record<string, unknown> = {}
  if (typeof body.name === 'string')        row.name        = body.name.trim()
  if (typeof body.description === 'string') row.description = body.description.trim()
  if (typeof body.image_url === 'string')   row.image_url   = body.image_url.trim()
  if (body.rate !== undefined)              row.rate        = Number(body.rate)
  if (body.quantity !== undefined)          row.quantity    = parseInt(String(body.quantity), 10)
  if (body.sort_order !== undefined)        row.sort_order  = parseInt(String(body.sort_order), 10)
  if (body.deposit !== undefined)           row.deposit     = Number(body.deposit)
  if (body.is_available !== undefined)      row.is_available = Boolean(body.is_available)
  if (body.allow_offsite !== undefined)     row.allow_offsite = Boolean(body.allow_offsite)
  if (typeof body.category === 'string' && CATEGORIES.includes(body.category)) row.category = body.category
  return row
}

// PATCH /api/admin/equipment/[id]
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const row  = sanitize(body)
  if (Object.keys(row).length === 0) return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  if ('name' in row && !row.name) return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })

  const { data, error } = await supabase.from('equipment').update(row).eq('id', params.id).select(COLUMNS).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Equipment not found' }, { status: 404 })
  return NextResponse.json({ equipment: data })
}

// DELETE /api/admin/equipment/[id]
// Blocked when the item is attached to bookings (FK) — deactivate instead.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { count } = await supabase
    .from('booking_add_ons')
    .select('id', { count: 'exact', head: true })
    .eq('equipment_id', params.id)

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        error: `This item is attached to ${count} booking(s), so it can't be deleted. Set it unavailable instead — it stays out of new rentals but its history is preserved.`,
        code: 'HAS_BOOKINGS',
      },
      { status: 409 }
    )
  }

  const { error } = await supabase.from('equipment').delete().eq('id', params.id)
  if (error) {
    if (error.code === '23503') {
      return NextResponse.json({ error: 'This item is referenced by existing records and cannot be deleted. Set it unavailable instead.', code: 'HAS_BOOKINGS' }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
}
