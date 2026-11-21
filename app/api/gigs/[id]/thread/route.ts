// POST /api/gigs/<id>/thread { body } — the applicant replies to the company
// on a STUDIO-posted gig. (Member-posted gigs use normal Messages instead.)
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { rateLimit } from '@/lib/rate-limit'
import { gigDb as db, GIG_SELECT, notifyCompanyMemberReply } from '@/lib/gigs-server'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({}))
  const body = String(b.body ?? '').trim().slice(0, 2000)
  if (!body) return NextResponse.json({ error: 'Write a message first.' }, { status: 400 })

  const rl = await rateLimit(`gigthread:${user.id}:${params.id}`, 20, 60 * 60_000)
  if (!rl.allowed) return NextResponse.json({ error: 'Slow down a little — try again shortly.' }, { status: 429 })

  const { data: g, error } = await db.from('gigs').select(GIG_SELECT).eq('id', params.id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!g || g.posted_by !== 'studio') return NextResponse.json({ error: 'Gig not found.' }, { status: 404 })
  const { data: app } = await db.from('gig_applications').select('id').eq('gig_id', g.id).eq('applicant_id', user.id).maybeSingle()
  if (!app) return NextResponse.json({ error: 'Apply first.' }, { status: 403 })

  const { error: iErr } = await db.from('gig_messages').insert({ application_id: app.id, sender: 'member', body }).select('id').single()
  if (iErr) return NextResponse.json({ error: iErr.message }, { status: 500 })
  const { data: p } = await db.from('customer_profiles').select('full_name').eq('id', user.id).maybeSingle()
  await notifyCompanyMemberReply(g as any, p?.full_name || 'The applicant', body)
  return NextResponse.json({ ok: true })
}
