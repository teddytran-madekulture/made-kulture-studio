// Admin — approve / edit / discard June's pending email drafts.
//
// POST /api/admin/inbox/[id]/draft
//   { messageId, action: 'send' | 'discard', content? }
//   'send'    → email the (optionally edited) draft as a threaded reply from
//               june@, then flip the message role draft → agent.
//   'discard' → delete the draft (Teddy can reply manually or ignore).

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { sendReply, juneEmailConfigured } from '@/lib/agent/gmail'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { messageId, action, content } = await req.json()
  if (!messageId || !action) return NextResponse.json({ error: 'messageId and action required' }, { status: 400 })

  const { data: msg } = await supabase
    .from('agent_messages')
    .select('id, role, content, conversation_id')
    .eq('id', messageId).eq('conversation_id', params.id).single()
  if (!msg || msg.role !== 'draft') {
    return NextResponse.json({ error: 'Draft not found (already handled?)' }, { status: 404 })
  }

  if (action === 'discard') {
    await supabase.from('agent_messages').delete().eq('id', msg.id)
    return NextResponse.json({ success: true })
  }

  if (action !== 'send') return NextResponse.json({ error: 'bad action' }, { status: 400 })
  if (!juneEmailConfigured()) return NextResponse.json({ error: 'Email channel not configured' }, { status: 500 })

  const { data: convo } = await supabase
    .from('agent_conversations')
    .select('id, gmail_thread_id, contact_email, subject')
    .eq('id', params.id).single()
  if (!convo?.gmail_thread_id || !convo.contact_email) {
    return NextResponse.json({ error: 'Not an email conversation' }, { status: 400 })
  }

  const finalBody = (typeof content === 'string' && content.trim() ? content.trim() : msg.content)
    + '\n\n— June\nMade Kulture · 4825 Gulf Freeway, Houston TX\nmadekulture.com · (832) 408-1631 (text)'

  // Reply to the most recent inbound gmail message in the thread.
  const { data: lastInbound } = await supabase
    .from('agent_messages')
    .select('external_id')
    .eq('conversation_id', convo.id).eq('role', 'user').not('external_id', 'is', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  try {
    const sentId = await sendReply({
      threadId: convo.gmail_thread_id,
      to: convo.contact_email,
      subject: convo.subject || 'Made Kulture',
      body: finalBody,
      inReplyToMsgId: lastInbound?.external_id ?? undefined,
    })
    await supabase.from('agent_messages')
      .update({ role: 'agent', content: finalBody, external_id: sentId })
      .eq('id', msg.id)
    await supabase.from('agent_conversations')
      .update({ status: 'open', last_message_at: new Date().toISOString() })
      .eq('id', convo.id)
    return NextResponse.json({ success: true })
  } catch (e: any) {
    console.error('[draft send] error:', e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
