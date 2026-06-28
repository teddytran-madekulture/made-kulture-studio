import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'

export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase
    .from('customer_profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Also fetch custom pricing overrides from the customers table
  const { data: custData } = await supabase
    .from('customers')
    .select('pricing_overrides')
    .eq('email', user.email!.toLowerCase())
    .maybeSingle()

  return NextResponse.json({
    profile: { ...data, email: user.email },
    pricingOverrides: custData?.pricing_overrides ?? null,
  })
}

export async function PUT(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { full_name, phone, instagram, sms_opt_in } = body

  const { data, error } = await supabase
    .from('customer_profiles')
    .upsert({ id: user.id, full_name, phone, instagram, sms_opt_in })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ profile: data })
}
