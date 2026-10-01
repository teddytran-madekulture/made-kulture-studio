import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { memberAccess, notListedResponse } from '@/lib/directory-access'
import { sendOwnerPush } from '@/lib/push'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const service = createServiceClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const REPORT_REASONS = ['nudity', 'sexual', 'harassment', 'not_theirs', 'spam', 'other'] as const
const LABEL: Record<string, string> = {
  nudity: 'Nudity', sexual: 'Sexual content', harassment: 'Harassment or hate',
  not_theirs: "Not their work", spam: 'Spam', other: 'Other',
}
// Distinct members whose open reports take a photo off Explore until Teddy
// looks at it. Three, so one person can't pull a photo they just dislike.
const AUTO_HIDE_AT = 3

// POST /api/directory/report — { imageId, reason, note? }
// Anonymous to the photo's owner: they are never told who reported, or that
// anyone did. The reporter id is kept only to stop repeat reports by one person.
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to report.' }, { status: 401 })

  // Same gate as viewing profiles: only members who can see the photo can report it.
  const me = await memberAccess(service, user.id)
  if (!me.listed) return notListedResponse(me, 'report photos')

  const body = await req.json().catch(() => ({} as any))
  const imageId = String(body.imageId || '')
  const reason = String(body.reason || '')
  const note = typeof body.note === 'string' ? body.note.trim().slice(0, 300) || null : null
  if (!imageId || !(REPORT_REASONS as readonly string[]).includes(reason)) {
    return NextResponse.json({ error: 'Pick a reason.' }, { status: 400 })
  }

  const { data: img, error: imgErr } = await service
    .from('portfolio_images')
    .select('id, user_id, explore_hidden, reviewed_at, hidden')
    .eq('id', imageId).maybeSingle()
  if (imgErr) return NextResponse.json({ error: imgErr.message }, { status: 500 })
  if (!img || img.hidden) return NextResponse.json({ error: 'Photo not found.' }, { status: 404 })
  if (img.user_id === user.id) return NextResponse.json({ error: "You can't report your own photo." }, { status: 400 })

  // One report per person per photo. A repeat is answered the same as the first,
  // so the button never reveals anything.
  const { data: inserted, error: insErr } = await service
    .from('portfolio_reports')
    .upsert({ image_id: imageId, reporter_id: user.id, reason, note }, { onConflict: 'image_id,reporter_id', ignoreDuplicates: true })
    .select('id')
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  const isNew = !!inserted?.length
  if (!isNew) return NextResponse.json({ ok: true })

  // Count open reports since Teddy last reviewed (and kept) this photo.
  let q = service.from('portfolio_reports')
    .select('reporter_id', { count: 'exact', head: true })
    .eq('image_id', imageId).eq('status', 'open')
  if (img.reviewed_at) q = q.gt('created_at', img.reviewed_at)
  const { count } = await q
  const open = count ?? 1

  let autoHidden = false
  if (open >= AUTO_HIDE_AT && !img.explore_hidden) {
    const { data: upd } = await service.from('portfolio_images')
      .update({ explore_hidden: true, explore_hidden_reason: 'reports' })
      .eq('id', imageId).eq('explore_hidden', false).select('id')
    autoHidden = !!upd?.length
  }

  const { data: owner } = await service.from('customer_profiles').select('full_name').eq('id', img.user_id).maybeSingle()
  const who = owner?.full_name || 'a member'
  try {
    if (autoHidden) {
      await sendOwnerPush({
        title: 'Photo pulled from Explore',
        body:  `${open} members reported a photo from ${who}. It's off Explore until you review it.`,
        url:   '/admin/portfolio?filter=flagged',
        tag:   `portfolio-report-${imageId}`,
      })
    } else if (open === 1) {
      await sendOwnerPush({
        title: 'Portfolio photo reported',
        body:  `${LABEL[reason]} · photo from ${who}`,
        url:   '/admin/portfolio?filter=flagged',
        tag:   `portfolio-report-${imageId}`,
      })
    }
  } catch (e) { console.error('[directory/report] owner push failed (non-fatal):', e) }

  return NextResponse.json({ ok: true })
}
