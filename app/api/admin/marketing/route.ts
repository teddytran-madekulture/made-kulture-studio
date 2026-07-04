import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getSegmentCounts } from '@/lib/marketing'

export const dynamic = 'force-dynamic'

// GET /api/admin/marketing            → campaign list (+ per-campaign redemptions)
// GET /api/admin/marketing?segments=1 → recipient counts per segment
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  if (req.nextUrl.searchParams.get('segments')) {
    return NextResponse.json({ counts: await getSegmentCounts() })
  }

  const db = supabaseAdmin()
  const { data: campaigns } = await db
    .from('marketing_campaigns')
    .select('id, name, segment_key, subject, promo_id, status, recipient_count, sent_at, created_at, promo_codes(code)')
    .order('created_at', { ascending: false })

  // ROI: redemptions of each campaign's attached promo since it was sent.
  const withStats = await Promise.all((campaigns ?? []).map(async (c: any) => {
    let redemptions = 0
    if (c.promo_id && c.sent_at) {
      const { count } = await db.from('promo_redemptions')
        .select('id', { count: 'exact', head: true })
        .eq('promo_id', c.promo_id).gte('created_at', c.sent_at)
      redemptions = count ?? 0
    }
    return { ...c, code: c.promo_codes?.code ?? null, redemptions }
  }))

  return NextResponse.json({ campaigns: withStats })
}

// POST /api/admin/marketing — create a draft campaign.
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }) }
  if (!b.name || !b.subject || !b.body_html) return NextResponse.json({ error: 'Name, subject, and body are required.' }, { status: 400 })
  const segment_key = ['all', 'members', 'guests', 'lapsed', 'recent'].includes(b.segment_key) ? b.segment_key : 'all'

  const { data, error } = await supabaseAdmin().from('marketing_campaigns').insert({
    name: b.name, segment_key, subject: b.subject, body_html: b.body_html,
    promo_id: b.promo_id || null, status: 'draft',
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, id: data?.id })
}
