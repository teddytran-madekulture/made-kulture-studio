// Open Call voting (migration 151).
//   GET  → during voting: the shortlist (signed images), my vote, and whether I
//          can vote. Counts are NEVER returned here — hidden until it closes.
//   POST { submissionId } → cast or change my vote.
//
// Who votes: LISTED directory members (lib/directory-access.ts — the same gate
// as every community feature). The shortlist is only shown to them, which is
// what entrants agreed to ("shown to directory members for the vote").

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { supabaseAdmin } from '@/lib/supabase'
import { memberAccess } from '@/lib/directory-access'
import { rateLimit } from '@/lib/rate-limit'
import { OPEN_CALL_BUCKET, openCallPhase, type OpenCall } from '@/lib/open-calls'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const CALL_COLS = 'id, slug, title, status, opens_at, closes_at, voting_opens_at, voting_closes_at, rolling'

async function setup(slug: string) {
  const { data: { user } } = await createClient().auth.getUser()
  const sb = supabaseAdmin()
  const { data } = await sb.from('open_calls').select(CALL_COLS).eq('slug', slug).maybeSingle()
  const call = data as OpenCall | null
  return { user, sb, call, phase: call ? openCallPhase(call) : null }
}

export async function GET(_req: NextRequest, { params }: { params: { slug: string } }) {
  const { user, sb, call, phase } = await setup(params.slug)
  if (!call || call.status === 'draft') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (phase !== 'voting') return NextResponse.json({ phase, entries: [] })
  if (!user) return NextResponse.json({ phase, signedIn: false, entries: [] })

  let access
  try { access = await memberAccess(sb, user.id) } catch (e: any) {
    console.error('[open-call vote] access lookup failed:', e)
    return NextResponse.json({ error: 'Could not check your membership. Please try again.' }, { status: 500 })
  }
  if (!access.listed) {
    return NextResponse.json({ phase, signedIn: true, listed: false, optedIn: access.optedIn, blockers: access.blockers, entries: [] })
  }

  const { data: subs, error } = await sb.from('open_call_submissions')
    .select('id, auth_user_id, title, photographer, photographer_ig, credits, note, image_paths, mature_paths')
    .eq('call_id', call.id).in('status', ['shortlisted', 'winner']).order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const entries = []
  for (const s of subs ?? []) {
    const { data: signed } = await sb.storage.from(OPEN_CALL_BUCKET).createSignedUrls(s.image_paths ?? [], 60 * 60)
    entries.push({
      id: s.id, title: s.title, photographer: s.photographer, photographer_ig: s.photographer_ig,
      credits: s.credits ?? [], note: s.note, mine: s.auth_user_id === user.id,
      images: (signed ?? []).filter(x => x.signedUrl).map(x => ({ url: x.signedUrl, mature: (s.mature_paths ?? []).includes(x.path ?? '') })),
    })
  }
  const { data: vote } = await sb.from('open_call_votes').select('submission_id').eq('call_id', call.id).eq('voter_id', user.id).maybeSingle()

  return NextResponse.json({
    phase, signedIn: true, listed: true, entries,
    myVote: vote?.submission_id ?? null,
    closes: call.voting_closes_at,
  })
}

export async function POST(req: NextRequest, { params }: { params: { slug: string } }) {
  const { user, sb, call, phase } = await setup(params.slug)
  if (!user) return NextResponse.json({ error: 'Sign in to vote.' }, { status: 401 })
  if (!call) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  if (phase !== 'voting') return NextResponse.json({ error: 'Voting is not open for this call.' }, { status: 409 })

  const rl = await rateLimit(`opencall:vote:${user.id}`, 30, 60 * 60_000, { failOpen: true })
  if (!rl.allowed) return NextResponse.json({ error: rl.message }, { status: 429 })

  let access
  try { access = await memberAccess(sb, user.id) } catch {
    return NextResponse.json({ error: 'Could not check your membership. Please try again.' }, { status: 500 })
  }
  if (!access.listed) return NextResponse.json({ error: 'Voting is for members listed in the directory. Finish your profile to vote.' }, { status: 403 })

  const b = await req.json().catch(() => ({}))
  const submissionId = String(b?.submissionId ?? '')
  const { data: sub } = await sb.from('open_call_submissions')
    .select('id, auth_user_id, status').eq('id', submissionId).eq('call_id', call.id).maybeSingle()
  if (!sub || !['shortlisted', 'winner'].includes(sub.status)) return NextResponse.json({ error: 'That series is not on the shortlist.' }, { status: 400 })
  if (sub.auth_user_id === user.id) return NextResponse.json({ error: "You can't vote for your own series." }, { status: 400 })

  // "New" = the account was made after voting opened. Decided once, at the
  // first vote, and kept when the vote is changed.
  const created = user.created_at ? new Date(user.created_at).getTime() : 0
  const voterNew = !!call.voting_opens_at && created >= new Date(call.voting_opens_at).getTime()

  const now = new Date().toISOString()
  const { data: existing } = await sb.from('open_call_votes').select('id').eq('call_id', call.id).eq('voter_id', user.id).maybeSingle()
  const q = existing
    ? sb.from('open_call_votes').update({ submission_id: sub.id, updated_at: now }).eq('id', existing.id).select('id')
    : sb.from('open_call_votes').insert({ call_id: call.id, submission_id: sub.id, voter_id: user.id, voter_new: voterNew }).select('id')
  const { data, error } = await q
  if (error) {
    // 23505: a double tap raced the insert — the other request already voted.
    if ((error as any).code === '23505') return NextResponse.json({ error: 'Your vote is already in. Refresh and try again to change it.' }, { status: 409 })
    console.error('[open-call vote] write failed:', error)
    return NextResponse.json({ error: 'Could not save your vote. Please try again.' }, { status: 500 })
  }
  if (!data?.length) return NextResponse.json({ error: 'Could not save your vote. Please try again.' }, { status: 500 })
  return NextResponse.json({ success: true, myVote: sub.id })
}
