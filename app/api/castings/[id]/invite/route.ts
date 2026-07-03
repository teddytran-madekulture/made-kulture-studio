import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const service = createService(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/castings/<id>/invite { toUserId }
// The casting author invites a member — sends them a DM with the casting link.
// They flow through the normal "I'm interested" from there.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { toUserId } = await req.json().catch(() => ({}))
  if (!toUserId || toUserId === user.id) return NextResponse.json({ error: 'Invalid member.' }, { status: 400 })

  const { data: c } = await service.from('castings').select('author_id, title').eq('id', params.id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'Casting not found.' }, { status: 404 })
  if (c.author_id !== user.id) return NextResponse.json({ error: 'Only the author can invite.' }, { status: 403 })

  const { data: t } = await service.from('customer_profiles').select('directory_opt_in').eq('id', toUserId).maybeSingle()
  if (!t?.directory_opt_in) return NextResponse.json({ error: 'Member not found.' }, { status: 404 })

  const { data: meProf } = await service.from('customer_profiles').select('full_name').eq('id', user.id).maybeSingle()
  const inviterName = meProf?.full_name || 'A member'

  // Find or open the conversation, then drop in the invite message.
  const [a, b] = [user.id, toUserId].sort()
  let convId: string | null = null
  const { data: existing } = await service.from('conversations').select('id').eq('user_a', a).eq('user_b', b).maybeSingle()
  if (existing) convId = existing.id
  else {
    const { data: created } = await service.from('conversations').insert({ user_a: a, user_b: b }).select('id').single()
    convId = created?.id ?? null
  }
  if (!convId) return NextResponse.json({ error: 'Could not open a conversation.' }, { status: 500 })

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')
  await service.from('messages').insert({
    conversation_id: convId, sender_id: user.id,
    body: `${inviterName} invited you to a casting: "${c.title}" — take a look and tap "I'm interested" if you're in: ${appUrl}/account/castings/${params.id}`,
  })

  return NextResponse.json({ ok: true, conversationId: convId })
}
