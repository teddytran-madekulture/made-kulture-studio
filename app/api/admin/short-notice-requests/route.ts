import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/admin/short-notice-requests — pending requests for the dashboard banner.
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase
    .from('short_notice_requests')
    .select('id, customer_name, customer_email, desired_set, desired_date, desired_start, note, approve_token, requested_at')
    .eq('status', 'pending')
    .order('requested_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  // Attach readable set names (slug -> name) for the dashboard banner.
  const slugs = Array.from(new Set((data ?? []).map(r => r.desired_set).filter(Boolean)))
  const nameBySlug: Record<string, string> = {}
  if (slugs.length) {
    const { data: setRows } = await supabase.from('sets').select('slug, name').in('slug', slugs as string[])
    for (const row of setRows ?? []) nameBySlug[row.slug] = row.name
  }
  const requests = (data ?? []).map(r => ({ ...r, desired_set_name: r.desired_set ? (nameBySlug[r.desired_set] || r.desired_set) : null }))
  return NextResponse.json({ requests })
}
