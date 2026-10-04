// POST /api/listings/report { listingId, reason, note? } — a member flags a
// Services listing (misleading tags, off-topic, spam…). Anonymous to the
// vendor. Three distinct members' open reports put it on review_hold (off
// Services and profiles) until Teddy looks. Mirrors /api/directory/report.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { memberAccess, notListedResponse } from '@/lib/directory-access'
import { sendOwnerPush } from '@/lib/push'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const service = createService(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const LISTING_REPORT_REASONS = ['misleading', 'off_topic', 'spam', 'inappropriate', 'other'] as const
const LABEL: Record<string, string> = { misleading: 'Misleading tags or details', off_topic: 'Not a real service', spam: 'Spam', inappropriate: 'Inappropriate', other: 'Other' }
const AUTO_HOLD_AT = 3

export async function POST(req: NextRequest) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to report.' }, { status: 401 })
  const me = await memberAccess(service, user.id)
  if (!me.listed) return notListedResponse(me, 'report listings')

  const b = await req.json().catch(() => ({} as any))
  const listingId = String(b.listingId || '')
  const reason = String(b.reason || '')
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 300) || null : null
  if (!listingId || !(LISTING_REPORT_REASONS as readonly string[]).includes(reason)) return NextResponse.json({ error: 'Pick a reason.' }, { status: 400 })

  const { data: l, error: lErr } = await service.from('service_listings')
    .select('id, user_id, title, review_hold, reviewed_at').eq('id', listingId).maybeSingle()
  if (lErr) return NextResponse.json({ error: lErr.message }, { status: 500 })
  if (!l) return NextResponse.json({ error: 'Listing not found.' }, { status: 404 })
  if (l.user_id === user.id) return NextResponse.json({ error: "You can't report your own listing." }, { status: 400 })

  const { data: ins, error: insErr } = await service.from('listing_reports')
    .upsert({ listing_id: listingId, reporter_id: user.id, reason, note }, { onConflict: 'listing_id,reporter_id', ignoreDuplicates: true })
    .select('id')
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  if (!ins?.length) return NextResponse.json({ ok: true })   // repeat — same answer, reveals nothing

  let q = service.from('listing_reports').select('id', { count: 'exact', head: true }).eq('listing_id', listingId).eq('status', 'open')
  if (l.reviewed_at) q = q.gt('created_at', l.reviewed_at)
  const { count } = await q
  const open = count ?? 1

  let held = false
  if (open >= AUTO_HOLD_AT && !l.review_hold) {
    const { data: upd } = await service.from('service_listings')
      .update({ review_hold: true, review_hold_reason: 'reports' }).eq('id', listingId).eq('review_hold', false).select('id')
    held = !!upd?.length
  }
  try {
    if (held || open === 1) {
      await sendOwnerPush({
        title: held ? 'Listing pulled for review' : 'Listing reported',
        body: held ? `${open} members reported "${l.title}". It's hidden until you review it.` : `${LABEL[reason]} · "${l.title}"`,
        url: '/admin/listings?filter=flagged', tag: `listing-report-${listingId}`,
      })
    }
  } catch (e) { console.error('[listings/report] owner push failed (non-fatal):', e) }
  return NextResponse.json({ ok: true })
}
