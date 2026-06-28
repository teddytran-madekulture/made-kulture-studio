import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Upsert a customer, never overwriting an existing phone/name with a blank.
async function upsertCustomer(fields: {
  email: string
  name: string
  phone: string
  square_customer_id?: string
  acuity_client_id?: string
}) {
  // Check if customer already exists
  const { data: existing } = await supabase
    .from('customers')
    .select('id, name, phone')
    .eq('email', fields.email)
    .maybeSingle()

  const patch: Record<string, any> = { email: fields.email }

  // Only set name if incoming has one and existing doesn't (or existing is just email)
  if (fields.name && fields.name !== fields.email) {
    patch.name = existing?.name && existing.name !== fields.email ? existing.name : fields.name
  } else {
    patch.name = existing?.name || fields.name
  }

  // Only set phone if incoming has one; never blank out an existing number
  if (fields.phone) {
    patch.phone = fields.phone
  } else if (existing?.phone) {
    patch.phone = existing.phone   // keep what we have
  }
  // else: leave phone blank (both sources have nothing)

  if (fields.square_customer_id) patch.square_customer_id = fields.square_customer_id
  if (fields.acuity_client_id)   patch.acuity_client_id   = fields.acuity_client_id

  const { error } = await supabase
    .from('customers')
    .upsert(patch, { onConflict: 'email' })

  return error
}

// POST /api/admin/customers/import
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const results = {
    square: { fetched: 0, upserted: 0, errors: [] as string[] },
    acuity: { fetched: 0, upserted: 0, errors: [] as string[] },
  }

  // ── Square ─────────────────────────────────────────────────────────────────
  try {
    let cursor: string | undefined
    const squareCustomers: any[] = []

    do {
      const url = new URL('https://connect.squareup.com/v2/customers')
      url.searchParams.set('limit', '100')
      url.searchParams.set('sort_field', 'CREATED_AT')
      if (cursor) url.searchParams.set('cursor', cursor)

      const res = await fetch(url.toString(), {
        headers: {
          Authorization: `Bearer ${process.env.SQUARE_ACCESS_TOKEN}`,
          'Square-Version': '2024-01-18',
          'Content-Type': 'application/json',
        },
      })

      if (!res.ok) {
        const text = await res.text()
        results.square.errors.push(`Square API ${res.status}: ${text.slice(0, 200)}`)
        break
      }

      const body = await res.json()
      squareCustomers.push(...(body.customers ?? []))
      cursor = body.cursor
    } while (cursor)

    results.square.fetched = squareCustomers.length

    for (const c of squareCustomers) {
      const email = c.email_address?.toLowerCase().trim()
      if (!email) continue

      const name  = [c.given_name, c.family_name].filter(Boolean).join(' ').trim() || email
      // Strip formatting but keep the number; empty string → no phone
      const phone = c.phone_number?.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1') ?? ''

      const error = await upsertCustomer({ email, name, phone, square_customer_id: c.id })
      if (error) results.square.errors.push(`${email}: ${error.message}`)
      else results.square.upserted++
    }
  } catch (err: any) {
    results.square.errors.push(err.message)
  }

  // ── Acuity ─────────────────────────────────────────────────────────────────
  try {
    const credentials = Buffer.from(
      `${process.env.ACUITY_USER_ID}:${process.env.ACUITY_API_KEY}`
    ).toString('base64')

    const res = await fetch('https://acuityscheduling.com/api/v1/clients?max=2000', {
      headers: { Authorization: `Basic ${credentials}` },
    })

    if (!res.ok) {
      const text = await res.text()
      results.acuity.errors.push(`Acuity API ${res.status}: ${text.slice(0, 200)}`)
    } else {
      const clients: any[] = await res.json()
      results.acuity.fetched = clients.length

      for (const c of clients) {
        const email = c.email?.toLowerCase().trim()
        if (!email) continue

        const name  = [c.firstName, c.lastName].filter(Boolean).join(' ').trim() || email
        const phone = c.phone?.replace(/\D/g, '').replace(/^1(\d{10})$/, '$1') ?? ''

        const error = await upsertCustomer({ email, name, phone, acuity_client_id: String(c.id) })
        if (error) results.acuity.errors.push(`${email}: ${error.message}`)
        else results.acuity.upserted++
      }
    }
  } catch (err: any) {
    results.acuity.errors.push(err.message)
  }

  return NextResponse.json({
    success: true,
    square: results.square,
    acuity: results.acuity,
    totalUpserted: results.square.upserted + results.acuity.upserted,
  })
}
