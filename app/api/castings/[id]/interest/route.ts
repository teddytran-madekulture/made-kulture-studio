import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendCastingInterestEmail } from '@/lib/email'
import { sendCastingInterestSMS } from '@/lib/sms'

export const dynamic = 'force-dynamic'

const service = createService(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/castings/<id>/interest — express interest AND open a conversation
// with the casting's author. Returns { conversationId } so the UI can jump to it.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await service
    .from('customer_profiles').select('directory_opt_in').eq('id', user.id).maybeSingle()
  if (!me?.directory_opt_in) return NextResponse.json({ error: 'Join the directory to respond.' }, { status: 403 })

  const { data: c } = await service.from('castings').select('author_id, status').eq('id', params.id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'Casting not found.' }, { status: 404 })
  if (c.author_id === user.id) return NextResponse.json({ error: "This is your casting." }, { status: 400 })

  // Register interest (idempotent) — track whether it's brand new so we only
  // email the author the first time someone opts in.
  const { data: existingPart } = await service
    .from('casting_participants').select('user_id').eq('casting_id', params.id).eq('user_id', user.id).maybeSingle()
  const isNewInterest = !existingPart
  if (isNewInterest) {
    await service.from('casting_participants').insert({ casting_id: params.id, user_id: user.id, status: 'interested' })
  }

  // Open (or find) the conversation with the author.
  const [a, b] = [user.id, c.author_id].sort()
  let conversationId: string | null = null
  const { data: existing } = await service
    .from('conversations').select('id').eq('user_a', a).eq('user_b', b).maybeSingle()
  if (existing) conversationId = existing.id
  else {
    const { data: created } = await service.from('conversations').insert({ user_a: a, user_b: b }).select('id').single()
    conversationId = created?.id ?? null
    if (!conversationId) {
      const { data: again } = await service.from('conversations').select('id').eq('user_a', a).eq('user_b', b).maybeSingle()
      conversationId = again?.id ?? null
    }
  }

  // Notify the author on new interest (best-effort; respects opt-out).
  if (isNewInterest) {
    try {
      const { data: authorProf } = await service.from('customer_profiles').select('notify_email, notify_sms, phone').eq('id', c.author_id).maybeSingle()
      const { data: casting } = await service.from('castings').select('title').eq('id', params.id).maybeSingle()
      const { data: meProf } = await service.from('customer_profiles').select('full_name').eq('id', user.id).maybeSingle()
      const interestedName = meProf?.full_name || 'A member'
      const title = casting?.title || 'your casting'
      if (authorProf?.notify_email !== false) {
        const { data: authUser } = await service.auth.admin.getUserById(c.author_id)
        const email = authUser?.user?.email
        if (email) await sendCastingInterestEmail({ to: email, interestedName, castingTitle: title, castingId: params.id })
      }
      if (authorProf?.notify_sms === true && authorProf?.phone) {
        await sendCastingInterestSMS(authorProf.phone, interestedName, title, params.id)
      }
    } catch { /* notification failures never break interest */ }
  }

  return NextResponse.json({ ok: true, conversationId })
}
