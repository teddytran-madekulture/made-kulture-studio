import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Service client to read across profiles; we only ever expose opted-in members
// and never return email/phone.
const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/directory?role=Photographer — members who opted into the directory
export async function GET(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to view the directory.' }, { status: 401 })

  const role = req.nextUrl.searchParams.get('role')

  let q = service
    .from('customer_profiles')
    .select('id, full_name, roles, instagram, avatar_url')
    .eq('directory_opt_in', true)
  if (role) q = q.contains('roles', [role])

  const { data, error } = await q.order('full_name', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const members = (data ?? [])
    .filter(m => (m.full_name ?? '').trim())
    .map(m => ({ id: m.id, full_name: m.full_name, roles: m.roles ?? [], instagram: m.instagram ?? null, avatar_url: m.avatar_url ?? null }))

  return NextResponse.json({ members })
}
