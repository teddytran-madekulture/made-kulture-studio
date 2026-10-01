import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { adminChangeEmail } from '@/lib/email-change'
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
      id, name, email, phone, status, banned, pricing_overrides, created_at,
      square_customer_id, acuity_client_id, alt_emails, alt_phones, alt_names,
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
      pricingOverrides: customer.pricing_overrides ?? null,
      altEmails:        customer.alt_emails ?? [],
      altPhones:        customer.alt_phones ?? [],
      altNames:         customer.alt_names ?? [],
      bookings,
      notes,
    }
  })
}

// PATCH /api/admin/customers/[id]
// Body: { name?, email?, phone?, status?, banned?, pricingOverrides? }
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const patch: Record<string, any> = {}

  if (body.name  !== undefined) patch.name   = body.name
  // ⚠️ The email is NOT a plain column edit: the login and everything keyed on
  // the address must move with it (lib/email-change.ts). Done first, and the
  // whole save stops if it can't be done cleanly.
  if (body.email !== undefined && body.email !== null) {
    const r = await adminChangeEmail(supabase, { customerId: params.id }, String(body.email))
    if (!r.ok) return NextResponse.json({ error: r.error }, { status: r.status })
  }
  if (body.phone !== undefined) patch.phone  = body.phone
  if (body.status !== undefined) patch.status = body.status
  if (body.banned !== undefined) patch.banned = body.banned
  if (body.pricingOverrides !== undefined) patch.pricing_overrides = body.pricingOverrides

  if (Object.keys(patch).length === 0 && body.email === undefined) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  // Email (if any) is already moved above; now the plain columns, then read back.
  if (Object.keys(patch).length) {
    const { error: upErr } = await supabase.from('customers').update(patch).eq('id', params.id)
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  }
  const { data, error } = await supabase.from('customers')
    .select('id, name, email, phone, status, banned')
    .eq('id', params.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ customer: data })
}
