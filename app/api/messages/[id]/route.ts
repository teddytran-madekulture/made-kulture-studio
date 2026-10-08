import { memberAccess, notListedResponse } from '@/lib/directory-access'
import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { sendMemberPush } from '@/lib/member-push'
import { NextRequest, NextResponse } from 'next/server'
import { sendNewMessageEmail } from '@/lib/email'
import { sendMessageSMS } from '@/lib/sms'
import { blockState } from '@/lib/blocks'

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
  let block = { byMe: false, byThem: false }
  try { block = await blockState(service, user.id, otherId) }
  catch { return NextResponse.json({ error: 'Could not load conversation.' }, { status: 500 }) }
  // Blocked by them → as if the thread doesn't exist (they never learn it).
  if (block.byThem) return NextResponse.json({ error: 'Not found' }, { status: 404 })
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
      blocked_by_me: block.byMe,
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

  // 2026-10-06: leaving the directory used to stop nothing — DMs, pushes and
  // emails kept flowing. Sending now needs BOTH sides listed, same as starting
  // a conversation does.
  const other = (c as any).user_a === user.id ? (c as any).user_b : (c as any).user_a
  const [meAcc, themAcc] = await Promise.all([memberAccess(service, user.id), memberAccess(service, other)])
  if (!meAcc.listed) return notListedResponse(meAcc, 'send messages')
  if (!themAcc.listed) return NextResponse.json({ error: 'This member is no longer in the directory.' }, { status: 403 })
  try {
    const block = await blockState(service, user.id, other)
    if (block.byMe) return NextResponse.json({ error: 'You blocked this member. Unblock them to send a message.' }, { status: 403 })
    if (block.byThem) return NextResponse.json({ error: "This message can't be sent." }, { status: 403 })
  } catch { return NextResponse.json({ error: 'Could not send. Try again.' }, { status: 500 }) }

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
    // Email cooldown per conversation (2026-10-05):
    //  • They haven't caught up since the last email → stay quiet for 3h (one
    //    email brings them back; a burst while they're away doesn't spam).
    //  • They HAVE read the thread since the last email → the next message is
    //    genuinely new, so email again — but never more than once per 30 min,
    //    so a slow live chat (sitting in the thread >2 min between replies)
    //    can't turn every reply into an email.
    const sinceNotified = recipNotified ? now - new Date(recipNotified).getTime() : Infinity
    const caughtUp = !!recipNotified && !!recipRead && new Date(recipRead).getTime() > new Date(recipNotified).getTime()
    const cooldownOk = !recipNotified
      || sinceNotified > 3 * 60 * 60 * 1000
      || (caughtUp && sinceNotified > 30 * 60 * 1000)
    // App push (migration 137): every message, unless they're in the thread
    // right now. NOT throttled like the email — the tag collapses a burst into
    // one notification per conversation instead.
    if (!activeRecently) {
      const { data: sp } = await service.from('customer_profiles').select('full_name').eq('id', user.id).maybeSingle()
      await sendMemberPush(recipientId, { title: sp?.full_name || 'New message', body: text.slice(0, 140), url: `/account/messages/${params.id}`, tag: `msg-${params.id}` })
    }
    if (!activeRecently && cooldownOk) {
      const { data: recipProf } = await service.from('customer_profiles').select('notify_email, notify_sms, phone').eq('id', recipientId).maybeSingle()
      const { data: senderProf } = await service.from('customer_profiles').select('full_name').eq('id', user.id).maybeSingle()
      const fromName = senderProf?.full_name || 'A member'
      let sent = false
      if (recipProf?.notify_email !== false) {
        const { data: authUser } = await service.auth.admin.getUserById(recipientId)
        const email = authUser?.user?.email
        if (email) { await sendNewMessageEmail({ to: email, fromName, conversationId: params.id }); sent = true }
      }
      if (recipProf?.notify_sms === true && recipProf?.phone) {
        await sendMessageSMS(recipProf.phone, fromName, params.id); sent = true
      }
      if (sent) {
        const ncol = recipIsA ? 'notified_a_at' : 'notified_b_at'
        await service.from('conversations').update({ [ncol]: new Date().toISOString() }).eq('id', params.id)
      }
    }
  } catch { /* notification failures never break sending */ }

  return NextResponse.json({ message })
}
