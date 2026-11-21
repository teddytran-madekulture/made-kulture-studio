// POST /api/gigs/<id>/report { reason, note? } — a member flags a gig.
// Anonymous to the poster. Three distinct members' open reports pull a live
// gig (status 'pulled') until Teddy reviews it. Mirrors /api/listings/report.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { memberAccess, notListedResponse } from '@/lib/directory-access'
import { sendOwnerPush } from '@/lib/push'
import { gigDb as db } from '@/lib/gigs-server'
import { GIG_AUTO_PULL_AT, GIG_REPORT_LABEL, GIG_REPORT_REASONS } from '@/lib/gigs'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to report.' }, { status: 401 })
  const me = await memberAccess(db, user.id)
  if (!me.listed) return notListedResponse(me, 'report gigs')

  const b = await req.json().catch(() => ({}))
  const reason = String(b.reason || '')
  const note = typeof b.note === 'string' ? b.note.trim().slice(0, 300) || null : null
  if (!(GIG_REPORT_REASONS as readonly string[]).includes(reason)) return NextResponse.json({ error: 'Pick a reason.' }, { status: 400 })

  const { data: g, error } = await db.from('gigs').select('id, poster_id, title, status').eq('id', params.id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!g) return NextResponse.json({ error: 'Gig not found.' }, { status: 404 })
  if (g.poster_id === user.id) return NextResponse.json({ error: "You can't report your own gig." }, { status: 400 })

  const { data: ins, error: insErr } = await db.from('gig_reports')
    .upsert({ gig_id: g.id, reporter_id: user.id, reason, note }, { onConflict: 'gig_id,reporter_id', ignoreDuplicates: true }).select('id')
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  if (!ins?.length) return NextResponse.json({ ok: true })

  const { count } = await db.from('gig_reports').select('id', { count: 'exact', head: true }).eq('gig_id', g.id).eq('status', 'open')
  const open = count ?? 1
  let pulled = false
  if (open >= GIG_AUTO_PULL_AT && g.status === 'live') {
    const { data: upd } = await db.from('gigs').update({ status: 'pulled', pull_reason: 'reports', updated_at: new Date().toISOString() })
      .eq('id', g.id).eq('status', 'live').select('id')
    pulled = !!upd?.length
  }
  try {
    await sendOwnerPush({
      title: pulled ? 'Gig pulled for review' : 'Gig reported',
      body: pulled ? `${open} members reported "${g.title}". It's hidden until you review it.` : `${GIG_REPORT_LABEL[reason]} · "${g.title}"`,
      url: '/admin/gigs?filter=flagged', tag: `gig-report-${g.id}`, requireInteraction: reason === 'pay_to_apply' || reason === 'scam',
    })
  } catch (e) { console.error('[gigs/report] owner push failed (non-fatal):', e) }
  return NextResponse.json({ ok: true })
}
