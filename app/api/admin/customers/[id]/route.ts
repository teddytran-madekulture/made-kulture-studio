import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/admin/customers/[id]
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: customer, error } = await supabase
    .from('customers')
    .select(`
      id, name, email, phone, status, banned, created_at,
      square_customer_id, acuity_client_id,
      bookings (
        id, start_time, end_time, status, total_amount, source, created_at,
        sets ( name )
      ),
      customer_notes (
        id, note, tag, created_at
      )
    `)
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 404 })

  // Sort bookings newest first, notes newest first
  const bookings = ((customer.bookings as any[]) ?? [])
    .sort((a, b) => new Date(b.start_time).getTime() - new Date(a.start_time).getTime())

  const notes = ((customer.customer_notes as any[]) ?? [])
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return NextResponse.json({
    customer: {
      id:               customer.id,
      name:             customer.name,
      email:            customer.email,
      phone:            customer.phone,
      status:           customer.status ?? 'regular',
      banned:           customer.banned ?? false,
      createdAt:        customer.created_at,
      squareCustomerId: customer.square_customer_id,
      acuityClientId:   customer.acuity_client_id,
      bookings,
      notes,
    }
  })
}

// PATCH /api/admin/customers/[id]
// Body: { name?, email?, phone?, status?, banned? }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const patch: Record<string, any> = {}

  if (body.name  !== undefined) patch.name   = body.name
  if (body.email !== undefined) patch.email  = body.email.toLowerCase().trim()
  if (body.phone !== undefined) patch.phone  = body.phone
  if (body.status !== undefined) patch.status = body.status
  if (body.banned !== undefined) patch.banned = body.banned

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  const { data, error } = await supabase
    .from('customers')
    .update(patch)
    .eq('id', params.id)
    .select('id, name, email, phone, status, banned')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ customer: data })
}
