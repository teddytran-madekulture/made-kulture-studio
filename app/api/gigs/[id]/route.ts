// /api/gigs/<id>
//   GET   → the gig, plus: my application (and, for studio-posted gigs, its
//           thread with the company); or, for the poster, every applicant.
//   PATCH → the poster: { action: 'close' | 'filled' } or { action: 'edit', ...fields }.
//           An edit is only allowed while pending or declined, and sends it
//           back to pending — an approved gig can't be quietly rewritten.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { memberAccess, notListedResponse } from '@/lib/directory-access'
import { sendOwnerPush } from '@/lib/push'
import { isAdminAuthed } from '@/lib/admin-auth'
import { gigDb as db, GIG_SELECT, publicGig, gigManageUrl } from '@/lib/gigs-server'
import { isLiveGig, isRelayedGig } from '@/lib/gigs'
import { parseGigBody } from '@/lib/gig-input'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to see gigs.' }, { status: 401 })
  const me = await memberAccess(db, user.id)
  if (!me.listed) return notListedResponse(me, 'see gigs')
  if (!/^[0-9a-f-]{36}$/i.test(params.id)) return NextResponse.json({ error: 'Gig not found.' }, { status: 404 })

  const { data: g, error } = await db.from('gigs').select(GIG_SELECT).eq('id', params.id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const isPoster = !!g && g.poster_id === user.id
  // PREVIEW (2026-11-23): the admin cookie may open a draft or any status, so
  // Teddy sees a gig exactly as members will before it goes out. Applying is
  // still refused by /apply for anything that isn't live.
  const adminPreview = !!g && !isLiveGig(g) && isAdminAuthed(req)
  if (!g || (!isPoster && !adminPreview && !isLiveGig(g))) {
    // An applicant can still open a gig that has since closed, to read their thread.
    const { data: mine } = g ? await db.from('gig_applications').select('id').eq('gig_id', g.id).eq('applicant_id', user.id).maybeSingle() : { data: null }
    if (!g || !mine) return NextResponse.json({ error: 'This gig is no longer up.' }, { status: 404 })
  }

  let poster: { id: string; name: string; avatar_url: string | null } | null = null
  if (g.posted_by === 'member' && g.poster_id) {
    const { data: p } = await db.from('customer_profiles').select('id, full_name, avatar_url').eq('id', g.poster_id).maybeSingle()
    if (p) poster = { id: p.id, name: p.full_name || g.company_name, avatar_url: p.avatar_url }
  }

  const base = { gig: { ...publicGig(g), ...(isPoster ? { decline_reason: g.decline_reason } : {}) }, poster, isPoster, preview: adminPreview, manage_url: isPoster && isRelayedGig(g) ? gigManageUrl(g.manage_token) : null }

  if (isPoster) {
    const { data: apps, error: aErr } = await db.from('gig_applications')
      .select('id, applicant_id, note, conversation_id, seen_at, created_at').eq('gig_id', g.id).order('created_at', { ascending: false })
    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })
    const ids = (apps ?? []).map(a => a.applicant_id)
    const { data: profs } = ids.length
      ? await db.from('customer_profiles').select('id, full_name, avatar_url, roles').in('id', ids)
      : { data: [] as any[] }
    const pm = new Map((profs ?? []).map((p: any) => [p.id, p]))
    const unseen = (apps ?? []).filter(a => !a.seen_at).map(a => a.id)
    if (unseen.length) await db.from('gig_applications').update({ seen_at: new Date().toISOString() }).in('id', unseen)
    return NextResponse.json({
      ...base,
      applicants: (apps ?? []).map(a => ({
        id: a.id, applicant_id: a.applicant_id, note: a.note, conversation_id: a.conversation_id, created_at: a.created_at,
        isNew: !a.seen_at,
        name: pm.get(a.applicant_id)?.full_name || '(member)', avatar_url: pm.get(a.applicant_id)?.avatar_url || null,
        roles: pm.get(a.applicant_id)?.roles ?? [],
      })),
    })
  }

  const { data: app } = await db.from('gig_applications')
    .select('id, note, conversation_id, created_at').eq('gig_id', g.id).eq('applicant_id', user.id).maybeSingle()
  let thread: { sender: string; body: string; created_at: string }[] = []
  if (app && isRelayedGig(g)) {
    const { data: msgs, error: mErr } = await db.from('gig_messages').select('sender, body, created_at').eq('application_id', app.id).order('created_at')
    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })
    thread = msgs ?? []
  }
  return NextResponse.json({ ...base, application: app ?? null, thread })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: g, error } = await db.from('gigs').select('id, poster_id, status, title, company_name, pay').eq('id', params.id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!g || g.poster_id !== user.id) return NextResponse.json({ error: 'Gig not found.' }, { status: 404 })

  const b = await req.json().catch(() => ({}))
  if (b.action === 'close' || b.action === 'filled') {
    const { data: upd, error: uErr } = await db.from('gigs')
      .update({ status: b.action === 'filled' ? 'filled' : 'closed', updated_at: new Date().toISOString() })
      .eq('id', g.id).in('status', ['pending', 'live', 'pulled']).select('id')
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })
    if (!upd?.length) return NextResponse.json({ error: 'This gig is already closed.' }, { status: 409 })
    return NextResponse.json({ ok: true })
  }
  if (b.action === 'edit') {
    if (!['pending', 'declined'].includes(g.status)) return NextResponse.json({ error: 'A live gig can’t be edited. Close it and post a new one.' }, { status: 409 })
    const parsed = parseGigBody(b)
    if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
    const { data: upd, error: uErr } = await db.from('gigs')
      .update({ ...parsed.row, company_name: parsed.row.company_name || g.company_name, status: 'pending', decline_reason: null, updated_at: new Date().toISOString() })
      .eq('id', g.id).in('status', ['pending', 'declined']).select('id')
    if (uErr) return NextResponse.json({ error: uErr.message }, { status: 500 })
    if (!upd?.length) return NextResponse.json({ error: 'That gig changed — reload and try again.' }, { status: 409 })
    if (g.status === 'declined') {
      try { await sendOwnerPush({ title: 'Gig resubmitted', body: `${parsed.row.title} · ${g.company_name}`, url: '/admin/gigs', tag: `gig-pending-${g.id}` }) } catch {}
    }
    return NextResponse.json({ ok: true })
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}
