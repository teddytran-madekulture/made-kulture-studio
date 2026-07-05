import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { getSegmentCounts } from '@/lib/marketing'

export const dynamic = 'force-dynamic'

// GET /api/admin/marketing               → campaign list (+ redemptions + engagement)
// GET /api/admin/marketing?segments=1     → recipient counts per segment
// GET /api/admin/marketing?suppressions=1 → who has unsubscribed / bounced (+ campaign)
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseAdmin()

  if (req.nextUrl.searchParams.get('segments')) {
    return NextResponse.json({ counts: await getSegmentCounts() })
  }

  // Do-not-email list — who opted out / bounced, and which campaign drove it.
  if (req.nextUrl.searchParams.get('suppressions')) {
    const { data } = await db.from('email_suppressions')
      .select('email, reason, created_at, campaign_id, marketing_campaigns(name)')
      .order('created_at', { ascending: false })
    const list = (data ?? []).map((s: any) => ({
      email: s.email, reason: s.reason, created_at: s.created_at,
      campaign: s.marketing_campaigns?.name ?? null,
    }))
    return NextResponse.json({ suppressions: list })
  }

  const { data: campaigns } = await db
    .from('marketing_campaigns')
    .select('id, name, segment_key, subject, promo_id, status, recipient_count, sent_at, created_at, promo_codes(code)')
    .order('created_at', { ascending: false })

  const withStats = await Promise.all((campaigns ?? []).map(async (c: any) => {
    // ROI: redemptions of the attached promo since the campaign was sent.
    let redemptions = 0
    if (c.promo_id && c.sent_at) {
      const { count } = await db.from('promo_redemptions')
        .select('id', { count: 'exact', head: true })
        .eq('promo_id', c.promo_id).gte('created_at', c.sent_at)
      redemptions = count ?? 0
    }

    // Engagement: unique opens / clicks / unsubscribes / bounces from the event log.
    let opened = 0, clicked = 0, unsubscribed = 0, bounced = 0
    if (c.sent_at) {
      const { data: ev } = await db.from('marketing_events')
        .select('email, type').eq('campaign_id', c.id)
      const uniq: Record<string, Set<string>> = { opened: new Set(), clicked: new Set(), unsubscribed: new Set(), bounced: new Set() }
      for (const e of ev ?? []) if (uniq[(e as any).type]) uniq[(e as any).type].add((e as any).email)
      opened = uniq.opened.size; clicked = uniq.clicked.size
      unsubscribed = uniq.unsubscribed.size; bounced = uniq.bounced.size
    }

    return { ...c, code: c.promo_codes?.code ?? null, redemptions, opened, clicked, unsubscribed, bounced }
  }))

  return NextResponse.json({ campaigns: withStats })
}

// POST /api/admin/marketing — create a draft campaign.
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }) }
  if (!b.name || !b.subject) return NextResponse.json({ error: 'Name and subject are required.' }, { status: 400 })
  if (!b.template_id && !b.body_html) return NextResponse.json({ error: 'Pick a template or provide HTML.' }, { status: 400 })
  const segment_key = ['all', 'members', 'guests', 'lapsed', 'recent'].includes(b.segment_key) ? b.segment_key : 'all'

  const { data, error } = await supabaseAdmin().from('marketing_campaigns').insert({
    name: b.name, segment_key, subject: b.subject,
    body_html: b.body_html || null,
    template_id: b.template_id || null,
    template_data: b.template_data || null,
    promo_id: b.promo_id || null, status: 'draft',
  }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, id: data?.id })
}
