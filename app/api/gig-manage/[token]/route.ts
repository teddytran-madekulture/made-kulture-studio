// /api/gig-manage/<token> — an OUTSIDE company's private view of its gig.
// Possession of the token is the authorization (same model as /manage/<token>
// for guest bookings); the lookup is BY the token, so there is no id to tamper
// with. Studio-posted gigs only.
//   GET   → the gig + every applicant (name, roles, bio, full portfolio minus 18+/hidden,
//           Instagram + website links, their note) + each relayed thread.
//           2026-11-21 Teddy's call: applying = choosing to show the company your work,
//           so IG + website are shared. Email and phone NEVER are.
//   POST  { applicationId, body } → reply to one applicant (relayed: push + email to them)
//   PATCH { action: 'filled' | 'closed' }
import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, clientIp } from '@/lib/rate-limit'
import { gigDb as db, GIG_SELECT, notifyMemberCompanyReply } from '@/lib/gigs-server'
import { cleanIgHandle } from '@/lib/directory-listing'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

async function gigFor(token: string) {
  if (!/^[0-9a-f-]{36}$/i.test(token)) return null
  const { data, error } = await db.from('gigs').select(GIG_SELECT).eq('manage_token', token).eq('posted_by', 'studio').maybeSingle()
  if (error) throw new Error(error.message)
  // A draft's link is never handed out (no email, no COPY LINK), but refuse it anyway.
  if (data && data.status === 'draft') return null
  return data
}

export async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const rl = await rateLimit(`gigmanage:get:${clientIp(req)}`, 120, 60 * 60_000)
  if (!rl.allowed) return NextResponse.json({ error: 'Too many requests. Try again later.' }, { status: 429 })
  let g: any
  try { g = await gigFor(params.token) } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
  if (!g) return NextResponse.json({ error: 'This link isn’t valid.' }, { status: 404 })

  const { data: apps, error: aErr } = await db.from('gig_applications')
    .select('id, applicant_id, note, seen_at, created_at').eq('gig_id', g.id).order('created_at', { ascending: false })
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })
  const ids = (apps ?? []).map(a => a.applicant_id)
  const appIds = (apps ?? []).map(a => a.id)
  const [profs, pics, msgs] = await Promise.all([
    ids.length ? db.from('customer_profiles').select('id, full_name, avatar_url, roles, bio, instagram, links').in('id', ids) : Promise.resolve({ data: [] as any[], error: null }),
    ids.length ? db.from('portfolio_images').select('user_id, url, sort_order, is_mature, hidden').in('user_id', ids).order('sort_order') : Promise.resolve({ data: [] as any[], error: null }),
    appIds.length ? db.from('gig_messages').select('application_id, sender, body, created_at').in('application_id', appIds).order('created_at') : Promise.resolve({ data: [] as any[], error: null }),
  ])
  if (profs.error || pics.error || msgs.error) return NextResponse.json({ error: (profs.error || pics.error || msgs.error)!.message }, { status: 500 })
  const pm = new Map((profs.data ?? []).map((p: any) => [p.id, p]))
  const photos: Record<string, string[]> = {}
  for (const p of pics.data ?? []) {
    if (p.hidden || p.is_mature) continue      // outsiders never see 18+ or hidden work
    const list = (photos[p.user_id] ??= [])
    if (list.length < 30) list.push(p.url)
  }
  const threads: Record<string, any[]> = {}
  for (const m of msgs.data ?? []) (threads[m.application_id] ??= []).push({ sender: m.sender, body: m.body, created_at: m.created_at })

  const unseen = (apps ?? []).filter(a => !a.seen_at).map(a => a.id)
  if (unseen.length) await db.from('gig_applications').update({ seen_at: new Date().toISOString() }).in('id', unseen)

  return NextResponse.json({
    gig: {
      title: g.title, company_name: g.company_name, pay: g.pay, roles_needed: g.roles_needed ?? [], gig_date: g.gig_date,
      date_note: g.date_note, location: g.location, apply_by: g.apply_by, status: g.status, expires_at: g.expires_at, description: g.description,
    },
    applicants: (apps ?? []).map(a => {
      const p = pm.get(a.applicant_id)
      return {
        id: a.id, isNew: !a.seen_at, created_at: a.created_at, note: a.note,
        name: p?.full_name || 'Member', avatar_url: p?.avatar_url || null, roles: p?.roles ?? [], bio: p?.bio || '',
        photos: photos[a.applicant_id] ?? [], thread: threads[a.id] ?? [],
        instagram: cleanIgHandle(p?.instagram) || null,
        links: (Array.isArray(p?.links) ? p.links : [])
          .filter((l: any) => l && typeof l.url === 'string' && /^https?:\/\//i.test(l.url.trim()))
          .slice(0, 5).map((l: any) => ({ label: String(l.label || '').slice(0, 40), url: l.url.trim() })),
      }
    }),
  })
}

export async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const rl = await rateLimit(`gigmanage:post:${params.token}`, 60, 60 * 60_000)
  if (!rl.allowed) return NextResponse.json({ error: 'Too many messages in the last hour. Try again later.' }, { status: 429 })
  let g: any
  try { g = await gigFor(params.token) } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
  if (!g) return NextResponse.json({ error: 'This link isn’t valid.' }, { status: 404 })
  const b = await req.json().catch(() => ({}))
  const body = String(b.body ?? '').trim().slice(0, 2000)
  if (!body) return NextResponse.json({ error: 'Write a message first.' }, { status: 400 })
  const { data: app } = await db.from('gig_applications').select('id, applicant_id').eq('id', String(b.applicationId || '')).eq('gig_id', g.id).maybeSingle()
  if (!app) return NextResponse.json({ error: 'Applicant not found.' }, { status: 404 })
  const { error } = await db.from('gig_messages').insert({ application_id: app.id, sender: 'company', body }).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  await notifyMemberCompanyReply(g, app.applicant_id, body)
  return NextResponse.json({ ok: true })
}

export async function PATCH(req: NextRequest, { params }: { params: { token: string } }) {
  let g: any
  try { g = await gigFor(params.token) } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
  if (!g) return NextResponse.json({ error: 'This link isn’t valid.' }, { status: 404 })
  const b = await req.json().catch(() => ({}))
  const status = b.action === 'filled' ? 'filled' : b.action === 'closed' ? 'closed' : null
  if (!status) return NextResponse.json({ error: 'Unknown action.' }, { status: 400 })
  const { data, error } = await db.from('gigs').update({ status, updated_at: new Date().toISOString() }).eq('id', g.id).in('status', ['live', 'pulled']).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'This gig is already closed.' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
