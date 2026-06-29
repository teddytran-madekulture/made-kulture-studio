import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

// Service-role client: the customers table is service-role only, and we scope
// every booking read to the signed-in user's own identity below.
const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Find this user's customer record(s) by their (verified) email so we also
  // catch bookings made before the account existed / not yet linked by auth id.
  const { data: custRows } = await service
    .from('customers')
    .select('id')
    .eq('email', (user.email ?? '').toLowerCase())
  const custIds = (custRows ?? []).map(c => c.id)

  const orFilter = [`auth_user_id.eq.${user.id}`]
  if (custIds.length) orFilter.push(`customer_id.in.(${custIds.join(',')})`)

  const { data, error } = await service
    .from('bookings')
    .select(`
      id, set_id, start_time, end_time, status, total_amount, acuity_appointment_id,
      sets ( name ),
      customers ( name ),
      booking_add_ons ( quantity, rate, paid, equipment ( name ) )
    `)
    .or(orFilter.join(','))
    .order('start_time', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Map DB columns to the shape the account page expects.
  const bookings = (data ?? []).map((b: any) => ({
    ...b,
    total_price:   b.total_amount,
    customer_name: b.customers?.name ?? null,
  }))

  return NextResponse.json({ bookings })
}
