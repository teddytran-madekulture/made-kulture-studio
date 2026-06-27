import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get bookings linked to this auth user OR matching their email
  const { data, error } = await supabase
    .from('bookings')
    .select(`
      id, set_id, start_time, end_time, status, total_price,
      customer_name, customer_email, customer_phone, acuity_appointment_id,
      sets ( name )
    `)
    .or(`auth_user_id.eq.${user.id},customer_email.eq.${user.email}`)
    .order('start_time', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ bookings: data ?? [] })
}
