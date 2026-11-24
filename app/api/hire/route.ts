// /api/hire — CLIENT GIGS (migration 188, 2026-11-23). Any signed-in customer
// can post a paid gig ("need a photographer for a birthday") without a
// directory profile.
//   GET  → the customer's own client gigs, with their private applicant link
//   POST → submit one. It waits for Teddy's approval (PENDING), then runs like a
//          studio-posted company gig: matching creatives are alerted and
//          applicants reach the customer through the manage link + email relay.
// The public name is first name + "Studio client" (clientPosterName); the
// customer's email is stored as company_email, which members NEVER see
// (publicGig strips it).
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { sendOwnerPush } from '@/lib/push'
import { gigDb as db, gigManageUrl } from '@/lib/gigs-server'
import { parseGigBody } from '@/lib/gig-input'
import { clientPosterName, CLIENT_GIG_ACTIVE_CAP } from '@/lib/gigs'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET() {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to see your posts.' }, { status: 401 })
  const { data: rows, error } = await db.from('gigs')
    .select('id, posted_by, company_name, title, pay, roles_needed, gig_date, date_note, location, status, decline_reason, expires_at, created_at, manage_token')
    // 'studio' = a company gig Teddy posted that is LINKED to this account (2026-11-23).
    .eq('poster_id', user.id).in('posted_by', ['client', 'studio']).neq('status', 'draft').order('created_at', { ascending: false }).limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const ids = (rows ?? []).map(r => r.id)
  const counts: Record<string, number> = {}
  if (ids.length) {
    const { data: apps, error: aErr } = await db.from('gig_applications').select('gig_id').in('gig_id', ids)
    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })
    for (const a of apps ?? []) counts[a.gig_id] = (counts[a.gig_id] ?? 0) + 1
  }
  return NextResponse.json({
    gigs: (rows ?? []).map(({ manage_token, ...g }) => ({
      ...g,
      applicants: counts[g.id] ?? 0,
      // Their own link. Only once it's live: a pending post has nothing to show.
      manage_url: g.status === 'pending' || g.status === 'declined' ? null : gigManageUrl(manage_token),
    })),
  })
}

export async function POST(req: NextRequest) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to post a gig.' }, { status: 401 })
  if (!user.email) return NextResponse.json({ error: 'Your account needs an email address to post.' }, { status: 400 })

  const rl = await rateLimit(`hirepost:${user.id}`, 3, 24 * 60 * 60_000)
  if (!rl.allowed) return NextResponse.json({ error: 'You have posted a few gigs today. Try again tomorrow, or text the studio.' }, { status: 429 })

  const { count, error: cErr } = await db.from('gigs').select('id', { count: 'exact', head: true })
    .eq('poster_id', user.id).in('status', ['pending', 'live']).gt('expires_at', new Date().toISOString())
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
  if ((count ?? 0) >= CLIENT_GIG_ACTIVE_CAP) return NextResponse.json({ error: `You can have up to ${CLIENT_GIG_ACTIVE_CAP} open posts at once. Close one first.` }, { status: 400 })

  const b = await req.json().catch(() => ({}))
  // No pay_tbd here: customers must name a budget.
  const parsed = parseGigBody(b)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error.replace('Gigs are paid work.', 'Creatives here are paid.').replace('Add the rate or budget, like "$400 / day".', 'Add your budget, like "$250 for 2 hours".') }, { status: 400 })
  if (b.terms !== true) return NextResponse.json({ error: 'Please agree to the terms.' }, { status: 400 })

  const { data: prof, error: pErr } = await db.from('customer_profiles').select('full_name').eq('id', user.id).maybeSingle()
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })

  const now = new Date().toISOString()
  const row = {
    ...parsed.row,
    posted_by: 'client', poster_id: user.id,
    company_name: clientPosterName(prof?.full_name || (user.user_metadata as any)?.full_name),
    company_email: String(user.email).toLowerCase(),
    status: 'pending', terms_accepted_at: now,
  }
  const { data, error } = await db.from('gigs').insert(row).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    await sendOwnerPush({ title: 'Client gig waiting for approval', body: `${row.title} · ${row.company_name} · ${row.pay}`, url: '/admin/gigs', tag: `gig-pending-${data.id}`, requireInteraction: true })
  } catch (e) { console.error('[hire] owner push failed (non-fatal):', e) }
  return NextResponse.json({ id: data.id })
}
