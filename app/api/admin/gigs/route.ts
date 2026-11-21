// /api/admin/gigs — Teddy's side of Gigs (migration 185).
//   GET                       → every gig with poster, applicant + open report counts
//   POST { ...fields, company_email?, test? } → post a gig FOR an outside company. Live at
//                               once (Teddy is the approval), alerts go out, and the
//                               company gets its private manage link by email.
//                               test: true → no member alerts, hidden from the board
//                               (open it by direct link); the company link email still sends.
//   PATCH { id, action, reason? }
//       approve  → pending/declined → live; alerts members (once) + tells the poster
//       decline  → pending → declined with a reason; tells the poster
//       pull     → live → pulled (off the board)
//       restore  → pulled → live, dismisses open reports (alerts only if never sent)
//       resend_link → re-email a studio-posted gig's manage link to the company
//   DELETE { id } → remove the gig, its applications and threads
// Writes are CLAIMS (.eq on the expected status + .select()): a write that
// matched nothing is reported, never shown as success.
import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { gigDb as db, GIG_SELECT, sendGigAlerts, notifyPosterDecision, emailCompanyManageLink, gigManageUrl } from '@/lib/gigs-server'
import { gigExpiry } from '@/lib/gigs'
import { parseGigBody } from '@/lib/gig-input'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const maxDuration = 60   // approve sends the member alerts inline

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data: rows, error } = await db.from('gigs').select(GIG_SELECT).order('created_at', { ascending: false }).limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const list = rows ?? []
  const ids = list.map(g => g.id)
  const posterIds = Array.from(new Set(list.map(g => g.poster_id).filter(Boolean))) as string[]
  const [apps, reps, profs] = await Promise.all([
    ids.length ? db.from('gig_applications').select('gig_id').in('gig_id', ids) : Promise.resolve({ data: [] as any[], error: null }),
    ids.length ? db.from('gig_reports').select('gig_id, reason, note').eq('status', 'open').in('gig_id', ids) : Promise.resolve({ data: [] as any[], error: null }),
    posterIds.length ? db.from('customer_profiles').select('id, full_name, account_type').in('id', posterIds) : Promise.resolve({ data: [] as any[], error: null }),
  ])
  if (apps.error || reps.error || profs.error) return NextResponse.json({ error: (apps.error || reps.error || profs.error)!.message }, { status: 500 })
  const appCount: Record<string, number> = {}
  for (const a of apps.data ?? []) appCount[a.gig_id] = (appCount[a.gig_id] ?? 0) + 1
  const reports: Record<string, { reason: string; note: string | null }[]> = {}
  for (const r of reps.data ?? []) (reports[r.gig_id] ??= []).push({ reason: r.reason, note: r.note })
  const pm = new Map((profs.data ?? []).map((p: any) => [p.id, p]))
  return NextResponse.json({
    gigs: list.map(g => ({
      ...g,
      manage_url: g.posted_by === 'studio' ? gigManageUrl(g.manage_token) : null,
      manage_token: undefined,
      poster_name: g.poster_id ? (pm.get(g.poster_id)?.full_name || '(member)') : null,
      poster_type: g.poster_id ? (pm.get(g.poster_id)?.account_type || null) : null,
      applicants: appCount[g.id] ?? 0,
      reports: reports[g.id] ?? [],
    })),
  })
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const parsed = parseGigBody(b)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  if (!parsed.row.company_name) return NextResponse.json({ error: 'Add the company name.' }, { status: 400 })
  const email = typeof b.company_email === 'string' ? b.company_email.trim().toLowerCase().slice(0, 200) : ''
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return NextResponse.json({ error: 'That company email doesn’t look right.' }, { status: 400 })

  const now = new Date().toISOString()
  const test = b.test === true
  const { data: g, error } = await db.from('gigs').insert({
    ...parsed.row, posted_by: 'studio', poster_id: null, company_email: email || null,
    status: 'live', approved_at: now, terms_accepted_at: now, is_test: test,
  }).select(GIG_SELECT).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const alerts = test ? { recipients: 0, pushed: 0, emailed: 0 } : await sendGigAlerts(g.id)
  const linkEmailed = email ? await emailCompanyManageLink(g as any) : false
  return NextResponse.json({ id: g.id, alerts, linkEmailed, manage_url: gigManageUrl(g.manage_token) })
}

export async function PATCH(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const id = String(b.id || '')
  const action = String(b.action || '')
  const { data: g, error } = await db.from('gigs').select(GIG_SELECT).eq('id', id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!g) return NextResponse.json({ error: 'Gig not found.' }, { status: 404 })
  const now = new Date().toISOString()

  const claim = async (from: string[], patch: Record<string, unknown>) => {
    const { data, error: e } = await db.from('gigs').update({ ...patch, updated_at: now }).eq('id', id).in('status', from).select('id')
    if (e) return e.message
    return data?.length ? null : 'That gig changed — reload and try again.'
  }

  if (action === 'approve') {
    // The board runs from approval, not from when it was submitted.
    const fail = await claim(['pending', 'declined'], { status: 'live', approved_at: now, decline_reason: null, expires_at: gigExpiry(g.apply_by) })
    if (fail) return NextResponse.json({ error: fail }, { status: 409 })
    const alerts = await sendGigAlerts(id)
    await notifyPosterDecision(g as any, 'approved')
    return NextResponse.json({ ok: true, alerts })
  }
  if (action === 'decline') {
    const reason = String(b.reason || '').trim().slice(0, 300)
    if (!reason) return NextResponse.json({ error: 'Add a short reason — the poster sees it.' }, { status: 400 })
    const fail = await claim(['pending'], { status: 'declined', decline_reason: reason })
    if (fail) return NextResponse.json({ error: fail }, { status: 409 })
    await notifyPosterDecision(g as any, 'declined', reason)
    return NextResponse.json({ ok: true })
  }
  if (action === 'pull') {
    const fail = await claim(['live'], { status: 'pulled', pull_reason: 'admin' })
    if (fail) return NextResponse.json({ error: fail }, { status: 409 })
    return NextResponse.json({ ok: true })
  }
  if (action === 'restore') {
    const fail = await claim(['pulled'], { status: 'live', pull_reason: null })
    if (fail) return NextResponse.json({ error: fail }, { status: 409 })
    await db.from('gig_reports').update({ status: 'dismissed' }).eq('gig_id', id).eq('status', 'open')
    const alerts = await sendGigAlerts(id)   // no-op if they already went out
    return NextResponse.json({ ok: true, alerts })
  }
  if (action === 'resend_link') {
    if (g.posted_by !== 'studio' || !g.company_email) return NextResponse.json({ error: 'This gig has no company email.' }, { status: 400 })
    const ok = await emailCompanyManageLink(g as any)
    return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: 'The email did not send. Copy the link instead.' }, { status: 502 })
  }
  return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
}

export async function DELETE(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const { data, error } = await db.from('gigs').delete().eq('id', String(b.id || '')).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Gig not found.' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
