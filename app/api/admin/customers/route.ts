import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)


// GET /api/admin/customers?q=jane
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const q = req.nextUrl.searchParams.get('q')?.trim()
  if (!q || q.length < 2) return NextResponse.json({ customers: [] })

  // Search by name, email, or phone
  const { data, error } = await supabase
    .from('customers')
    .select(`
      id, name, email, phone,
      bookings ( square_customer_id, square_card_id, created_at )
    `)
    .or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`)
    .limit(8)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Pull the most recent square_customer_id from their bookings
  const enriched = (data || []).map(c => {
    const sorted = (c.bookings as any[])
      .filter(b => b.square_customer_id)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

    return {
      id:               c.id,
      name:             c.name,
      email:            c.email,
      phone:            c.phone,
      squareCustomerId: sorted[0]?.square_customer_id ?? null,
      squareCardId:     sorted[0]?.square_card_id ?? null,
      hasCardOnFile:    !!sorted[0]?.square_customer_id,
    }
  })

  return NextResponse.json({ customers: enriched })
}
