import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Service role client — needed to read the customers table (RLS restricts to service_role only)
const serviceSupabase = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

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

  // Fetch custom pricing overrides using service role (customers table is service_role only)
  const { data: custData } = await serviceSupabase
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
  const { full_name, phone, instagram, sms_opt_in, roles, directory_opt_in, avatar_url } = body

  const patch: Record<string, unknown> = { id: user.id, full_name, phone, instagram, sms_opt_in }
  if (Array.isArray(roles)) patch.roles = roles.map((r: unknown) => String(r)).filter(Boolean)
  if (typeof directory_opt_in === 'boolean') patch.directory_opt_in = directory_opt_in
  if (typeof avatar_url === 'string') patch.avatar_url = avatar_url

  const { data, error } = await supabase
    .from('customer_profiles')
    .upsert(patch)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ profile: data })
}
