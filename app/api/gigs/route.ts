// /api/gigs — the Gigs board (migration 185).
//   GET  ?role=&q=&mine=1  → live gigs for listed members, newest first.
//                            mine=1 → the caller's own posts, every status.
//   POST                   → a listed Brand or Vendor posts a gig. It waits as
//                            'pending' until Teddy approves it in /admin/gigs.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { memberAccess, notListedResponse } from '@/lib/directory-access'
import { rateLimit } from '@/lib/rate-limit'
import { sendOwnerPush } from '@/lib/push'
import { gigDb as db, GIG_SELECT, publicGig } from '@/lib/gigs-server'
import { GIG_ACTIVE_CAP, GIG_POSTER_TYPES } from '@/lib/gigs'
import { parseGigBody } from '@/lib/gig-input'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(req: NextRequest) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to see gigs.' }, { status: 401 })
  const me = await memberAccess(db, user.id)
  if (!me.listed) return notListedResponse(me, 'see gigs')

  const sp = req.nextUrl.searchParams
  const mine = sp.get('mine') === '1'
  const role = (sp.get('role') || '').trim()
  const safeQ = (sp.get('q') || '').replace(/[%,()*]/g, '').slice(0, 60).trim()

  let q = db.from('gigs').select(GIG_SELECT)
  if (mine) q = q.eq('poster_id', user.id)
  else q = q.eq('status', 'live').eq('is_test', false).gt('expires_at', new Date().toISOString())   // test gigs open by direct link only
  if (safeQ) q = q.or(`title.ilike.%${safeQ}%,description.ilike.%${safeQ}%,company_name.ilike.%${safeQ}%`)
  const { data: rows, error } = await q.order('created_at', { ascending: false }).limit(300)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let list = rows ?? []
  if (role) list = list.filter(g => (g.roles_needed ?? []).some((r: string) => r.toLowerCase() === role.toLowerCase()))

  const ids = list.map(g => g.id)
  const counts: Record<string, number> = {}
  const mineApplied = new Set<string>()
  if (ids.length) {
    const { data: apps, error: aErr } = await db.from('gig_applications').select('gig_id, applicant_id').in('gig_id', ids)
    if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })
    for (const a of apps ?? []) {
      counts[a.gig_id] = (counts[a.gig_id] ?? 0) + 1
      if (a.applicant_id === user.id) mineApplied.add(a.gig_id)
    }
  }

  const { data: prof } = await db.from('customer_profiles').select('account_type').eq('id', user.id).maybeSingle()
  return NextResponse.json({
    canPost: (GIG_POSTER_TYPES as readonly string[]).includes(prof?.account_type ?? ''),
    gigs: list.map(g => ({
      ...publicGig(g),
      applied: mineApplied.has(g.id),
      // Applicant counts are the poster's business; members see "applied" only.
      ...(mine ? { applicants: counts[g.id] ?? 0, decline_reason: g.decline_reason } : {}),
    })),
  })
}

export async function POST(req: NextRequest) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to post a gig.' }, { status: 401 })
  const me = await memberAccess(db, user.id)
  if (!me.listed) return notListedResponse(me, 'post gigs')

  const { data: prof, error: pErr } = await db.from('customer_profiles').select('full_name, account_type').eq('id', user.id).maybeSingle()
  if (pErr) return NextResponse.json({ error: pErr.message }, { status: 500 })
  if (!(GIG_POSTER_TYPES as readonly string[]).includes(prof?.account_type ?? '')) {
    return NextResponse.json({ error: 'Gigs are posted by Brand and Vendor accounts. If you have work to share, text the studio and we can post it for you.' }, { status: 403 })
  }

  const rl = await rateLimit(`gigpost:${user.id}`, 5, 24 * 60 * 60_000)
  if (!rl.allowed) return NextResponse.json({ error: 'You have posted a lot of gigs today. Try again tomorrow.' }, { status: 429 })

  const { count, error: cErr } = await db.from('gigs').select('id', { count: 'exact', head: true })
    .eq('poster_id', user.id).in('status', ['pending', 'live']).gt('expires_at', new Date().toISOString())
  if (cErr) return NextResponse.json({ error: cErr.message }, { status: 500 })
  if ((count ?? 0) >= GIG_ACTIVE_CAP) return NextResponse.json({ error: `You can have up to ${GIG_ACTIVE_CAP} open gigs at once. Close one first.` }, { status: 400 })

  const b = await req.json().catch(() => ({}))
  const parsed = parseGigBody(b)
  if ('error' in parsed) return NextResponse.json({ error: parsed.error }, { status: 400 })
  if (b.terms !== true) return NextResponse.json({ error: 'Please agree to the poster terms.' }, { status: 400 })

  const row = {
    ...parsed.row,
    posted_by: 'member', poster_id: user.id,
    company_name: parsed.row.company_name || prof?.full_name || 'Company',
    status: 'pending', terms_accepted_at: new Date().toISOString(),
  }
  const { data, error } = await db.from('gigs').insert(row).select('id').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    await sendOwnerPush({ title: 'Gig waiting for approval', body: `${row.title} · ${row.company_name} · ${row.pay}`, url: '/admin/gigs', tag: `gig-pending-${data.id}`, requireInteraction: true })
  } catch (e) { console.error('[gigs] owner push failed (non-fatal):', e) }
  return NextResponse.json({ id: data.id })
}
