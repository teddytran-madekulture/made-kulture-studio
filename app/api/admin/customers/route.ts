import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/admin/customers?q=jane&page=1&limit=50&status=banned
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = req.nextUrl
  const q      = searchParams.get('q')?.trim()
  const status = searchParams.get('status')   // 'banned' | 'vip' | 'warning' | 'regular' | null
  const page   = Math.max(1, parseInt(searchParams.get('page') ?? '1'))
  const limit  = Math.min(100, parseInt(searchParams.get('limit') ?? '50'))
  const offset = (page - 1) * limit

  let query = supabase
    .from('customers')
    .select(`
      id, name, email, phone, status, banned, created_at,
      square_customer_id, acuity_client_id, alt_emails, alt_phones, alt_names,
      bookings ( id, status, total_amount )
    `, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (q && q.length >= 2) {
    // ilike on the primary fields (substring) + exact match against merged
    // alternate emails/phones, so a lookup finds people by any saved contact.
    query = query.or(
      `name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%,alt_emails.cs.{"${q}"},alt_phones.cs.{"${q}"},alt_names.cs.{"${q}"}`
    )
  }

  if (status === 'banned') {
    query = query.eq('banned', true)
  } else if (status && status !== 'all') {
    query = query.eq('status', status)
  }

  const { data, error, count } = await query

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const customers = (data ?? []).map(c => {
    const bkgs = (c.bookings as any[]) ?? []
    return {
      id:               c.id,
      name:             c.name,
      email:            c.email,
      phone:            c.phone,
      status:           c.status ?? 'regular',
      banned:           c.banned ?? false,
      createdAt:        c.created_at,
      squareCustomerId: c.square_customer_id,
      acuityClientId:   c.acuity_client_id,
      totalBookings:    bkgs.length,
      confirmedBookings: bkgs.filter(b => b.status === 'confirmed').length,
      totalSpend:       bkgs.reduce((sum: number, b: any) => sum + (b.total_amount ?? 0), 0),
    }
  })

  return NextResponse.json({ customers, total: count ?? 0, page, limit })
}
