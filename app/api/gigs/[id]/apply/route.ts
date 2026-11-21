// POST /api/gigs/<id>/apply { note } — a listed member applies to a live gig.
//   Member-posted gig → opens (or reuses) the directory DM with the poster and
//                       posts the application into it, same as a listing request.
//   Studio-posted gig → starts a private relayed thread with the company
//                       (gig_messages); the company sees it on its manage link.
// Neither side's email or phone is shared.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { memberAccess, notListedResponse } from '@/lib/directory-access'
import { rateLimit } from '@/lib/rate-limit'
import { gigDb as db, GIG_SELECT, notifyNewApplicant } from '@/lib/gigs-server'
import { isLiveGig } from '@/lib/gigs'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to apply.' }, { status: 401 })
  const me = await memberAccess(db, user.id)
  if (!me.listed) return notListedResponse(me, 'apply to gigs')

  const b = await req.json().catch(() => ({}))
  const note = String(b.note ?? '').trim().slice(0, 1500)
  if (note.length < 10) return NextResponse.json({ error: 'Add a short note about why you’re a fit.' }, { status: 400 })

  const rl = await rateLimit(`gigapply:${user.id}`, 15, 60 * 60_000)
  if (!rl.allowed) return NextResponse.json({ error: 'You have applied to a lot of gigs in the last hour. Try again a bit later.' }, { status: 429 })

  const { data: g, error } = await db.from('gigs').select(GIG_SELECT).eq('id', params.id).maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!g || !isLiveGig(g)) return NextResponse.json({ error: 'This gig is no longer taking applications.' }, { status: 409 })
  if (g.poster_id === user.id) return NextResponse.json({ error: 'This is your gig.' }, { status: 400 })

  const { data: existing } = await db.from('gig_applications').select('id').eq('gig_id', g.id).eq('applicant_id', user.id).maybeSingle()
  if (existing) return NextResponse.json({ error: 'You already applied to this gig.' }, { status: 409 })

  const { data: meProf } = await db.from('customer_profiles').select('full_name').eq('id', user.id).maybeSingle()
  const myName = meProf?.full_name || 'A member'

  // Member-posted: the DM with the poster.
  let conversationId: string | null = null
  if (g.posted_by === 'member' && g.poster_id) {
    const [a, bId] = [user.id, g.poster_id].sort()
    const { data: conv } = await db.from('conversations').select('id').eq('user_a', a).eq('user_b', bId).maybeSingle()
    if (conv) conversationId = conv.id
    else {
      const { data: created } = await db.from('conversations').insert({ user_a: a, user_b: bId }).select('id').single()
      conversationId = created?.id ?? null
      if (!conversationId) {
        const { data: again } = await db.from('conversations').select('id').eq('user_a', a).eq('user_b', bId).maybeSingle()
        conversationId = again?.id ?? null
      }
    }
    if (!conversationId) return NextResponse.json({ error: 'Could not reach the poster. Try again.' }, { status: 500 })
  }

  const { data: app, error: iErr } = await db.from('gig_applications')
    .insert({ gig_id: g.id, applicant_id: user.id, note, conversation_id: conversationId }).select('id').single()
  if (iErr) {
    if ((iErr as any).code === '23505') return NextResponse.json({ error: 'You already applied to this gig.' }, { status: 409 })
    return NextResponse.json({ error: iErr.message }, { status: 500 })
  }

  if (conversationId) {
    const text = [`APPLIED: ${g.title}`, `Pay: ${g.pay}`, '', note].join('\n').slice(0, 2000)
    const { error: mErr } = await db.from('messages').insert({ conversation_id: conversationId, sender_id: user.id, body: text }).select('id').single()
    if (mErr) console.error('[gigs/apply] DM insert failed (application kept):', mErr.message)
    const [a] = [user.id, g.poster_id!].sort()
    await db.from('conversations').update({ [a === user.id ? 'last_read_a' : 'last_read_b']: new Date().toISOString() }).eq('id', conversationId)
  } else {
    const { error: mErr } = await db.from('gig_messages').insert({ application_id: app.id, sender: 'member', body: note }).select('id').single()
    if (mErr) console.error('[gigs/apply] thread insert failed (application kept):', mErr.message)
  }

  await notifyNewApplicant(g as any, myName, note, conversationId)
  return NextResponse.json({ ok: true, conversationId })
}
