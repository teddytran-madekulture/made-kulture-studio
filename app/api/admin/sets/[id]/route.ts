import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const SET_COLUMNS = 'id, name, description, rate_per_hour, min_hours, capacity, features, is_active, created_at'

function sanitizeSet(body: any) {
  const row: Record<string, unknown> = {}

  if (typeof body.name === 'string')        row.name        = body.name.trim()
  if (typeof body.description === 'string') row.description = body.description.trim()
  if (body.rate_per_hour !== undefined)     row.rate_per_hour = Number(body.rate_per_hour)
  if (body.min_hours !== undefined)         row.min_hours   = body.min_hours === null ? null : Number(body.min_hours)
  if (body.capacity !== undefined)          row.capacity    = parseInt(String(body.capacity), 10)
  if (body.is_active !== undefined)         row.is_active   = Boolean(body.is_active)

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

// PATCH /api/admin/sets/[id] — update fields or toggle is_active
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const row  = sanitizeSet(body)

  if (Object.keys(row).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }
  if ('name' in row && !row.name) {
    return NextResponse.json({ error: 'Set name cannot be empty' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('sets')
    .update(row)
    .eq('id', params.id)
    .select(SET_COLUMNS)
    .single()

  if (error) {
    if (error.code === '23505') {
      return NextResponse.json({ error: `A set named "${row.name}" already exists.` }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  if (!data) return NextResponse.json({ error: 'Set not found' }, { status: 404 })

  return NextResponse.json({ set: data })
}

// DELETE /api/admin/sets/[id]
// Hard-delete is blocked when bookings reference the set (FK has no cascade).
// In that case we tell the caller to deactivate instead.
export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Pre-check for linked bookings so we can return a friendly message
  const { count } = await supabase
    .from('bookings')
    .select('id', { count: 'exact', head: true })
    .eq('set_id', params.id)

  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        error: `This set has ${count} booking(s) attached, so it can't be deleted. Deactivate it instead — it will be hidden from new bookings but its history stays intact.`,
        code: 'HAS_BOOKINGS',
      },
      { status: 409 }
    )
  }

  const { error } = await supabase.from('sets').delete().eq('id', params.id)

  if (error) {
    // Foreign-key violation fallback (in case the count check missed anything)
    if (error.code === '23503') {
      return NextResponse.json(
        { error: 'This set is referenced by existing records and cannot be deleted. Deactivate it instead.', code: 'HAS_BOOKINGS' },
        { status: 409 }
      )
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
