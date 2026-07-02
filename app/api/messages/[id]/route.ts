import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendNewMessageEmail } from '@/lib/email'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const service = createService(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function participant(conversationId: string, userId: string) {
  const { data: c } = await service
    .from('conversations').select('user_a, user_b').eq('id', conversationId).maybeSingle()
  if (!c || (c.user_a !== userId && c.user_b !== userId)) return null
  return c
}

// GET /api/messages/<id> — conversation meta (the other member) + all messages.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const c = await participant(params.id, user.id)
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const otherId = c.user_a === user.id ? c.user_b : c.user_a
  const { data: prof } = await service
    .from('customer_profiles').select('id, full_name, avatar_url').eq('id', otherId).maybeSingle()
  const { data: messages } = await service
    .from('messages').select('id, sender_id, body, created_at')
    .eq('conversation_id', params.id).order('created_at', { ascending: true })

  return NextResponse.json({
    conversation: {
      id: params.id,
      me: user.id,
      other: { id: otherId, name: prof?.full_name || '(member)', avatar_url: prof?.avatar_url || null },
    },
    messages: messages ?? [],
  })
}

// POST /api/messages/<id> { body } — send a message.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const c = await participant(params.id, user.id)
  if (!c) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { body } = await req.json().catch(() => ({}))
  const text = String(body ?? '').trim().slice(0, 2000)
  if (!text) return NextResponse.json({ error: 'Empty message' }, { status: 400 })

  const { data: message, error } = await service
    .from('messages')
    .insert({ conversation_id: params.id, sender_id: user.id, body: text })
    .select('id, sender_id, body, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Mark my own side read (I just saw the thread).
  const col = c.user_a === user.id ? 'last_read_a' : 'last_read_b'
  await service.from('conversations').update({ [col]: new Date().toISOString() }).eq('id', params.id)

  // Throttled email notify to the recipient (best-effort; never blocks the send).
  try {
    const recipientId = c.user_a === user.id ? c.user_b : c.user_a
    const recipIsA = c.user_a === recipientId
    const { data: conv } = await service
      .from('conversations').select('last_read_a, last_read_b, notified_a_at, notified_b_at').eq('id', params.id).maybeSingle()
    const recipRead = recipIsA ? conv?.last_read_a : conv?.last_read_b
    const recipNotified = recipIsA ? conv?.notified_a_at : conv?.notified_b_at
    const now = Date.now()
    const activeRecently = recipRead && now - new Date(recipRead).getTime() < 2 * 60 * 1000       // in the thread now
    const cooldownOk = !recipNotified || now - new Date(recipNotified).getTime() > 3 * 60 * 60 * 1000 // 3h per convo
    if (!activeRecently && cooldownOk) {
      const { data: recipProf } = await service.from('customer_profiles').select('notify_email').eq('id', recipientId).maybeSingle()
      if (recipProf?.notify_email !== false) {
        const { data: senderProf } = await service.from('customer_profiles').select('full_name').eq('id', user.id).maybeSingle()
        const { data: authUser } = await service.auth.admin.getUserById(recipientId)
        const email = authUser?.user?.email
        if (email) {
          await sendNewMessageEmail({ to: email, fromName: senderProf?.full_name || 'A member', conversationId: params.id })
          const ncol = recipIsA ? 'notified_a_at' : 'notified_b_at'
          await service.from('conversations').update({ [ncol]: new Date().toISOString() }).eq('id', params.id)
        }
      }
    }
  } catch { /* notification failures never break sending */ }

  return NextResponse.json({ message })
}
