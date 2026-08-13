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

  // ?history=1 — everything already resolved. The banner only ever showed what
  // was PENDING, so once you answered a request it vanished with no record of
  // what you decided. Worth keeping: the hours people repeatedly ask for and
  // don't get are real evidence about whether to open then.
  if (req.nextUrl.searchParams.get('history') === '1') {
    const { data, error } = await supabase
      .from('short_notice_requests')
      .select('id, customer_name, customer_email, desired_set, desired_date, desired_start, desired_hours, quoted_cents, status, requested_at, resolved_at, booking_id, granted_expires_at')
      .neq('status', 'pending')
      .order('resolved_at', { ascending: false, nullsFirst: false })
      .limit(30)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const slugs = Array.from(new Set((data ?? []).map(r => r.desired_set).filter(Boolean)))
    const nameBySlug: Record<string, string> = {}
    if (slugs.length) {
      const { data: setRows } = await supabase.from('sets').select('slug, name').in('slug', slugs as string[])
      for (const row of setRows ?? []) nameBySlug[row.slug] = row.name
    }
    return NextResponse.json({
      history: (data ?? []).map(r => ({
        ...r,
        desired_set_name: r.desired_set ? (nameBySlug[r.desired_set] || r.desired_set) : null,
        // What actually happened, rather than just "approved": a request that
        // produced a booking was charged; one that only opened a window wasn't.
        outcome: r.status === 'denied' ? 'denied' : r.booking_id ? 'booked' : 'unlocked',
      })),
    })
  }
  const { data, error } = await supabase
    .from('short_notice_requests')
    // desired_hours/quoted_cents/square_card_id drive the CHARGE button on the
    // dashboard banner. ⚠️ The banner is the SECOND approval surface (the token
    // page is the first) — without these it silently offers only the no-charge
    // path, which is the wrong default for a request that came with consent.
    .select('id, customer_name, customer_email, desired_set, desired_date, desired_start, desired_hours, quoted_cents, square_card_id, note, approve_token, requested_at')
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
