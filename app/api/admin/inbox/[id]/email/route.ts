// Admin — write your own email reply on a thread.
//
// POST /api/admin/inbox/[id]/email  { body, subject?, cc?, bcc? }
//
// Before this existed the inbox could only APPROVE one of June's drafts — if she
// hadn't drafted anything, or you'd discarded it, there was no way to reply from
// the admin at all and the footer told you to go use your mailbox. This sends a
// threaded reply as yourself, with whatever files are staged on the thread, and
// takes the conversation over from June the same way a chat reply does.

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { juneEmailConfigured } from '@/lib/agent/gmail'
import { sendConversationEmail, parseAddresses, signatureFor } from '@/lib/agent/email-send'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!juneEmailConfigured()) return NextResponse.json({ error: 'Email channel not configured' }, { status: 500 })

  const payload = await req.json().catch(() => ({}))
  const text = String(payload?.body ?? '').trim().slice(0, 20000)
  const cc = parseAddresses(payload?.cc)
  const bcc = parseAddresses(payload?.bcc)

  const { data: convo } = await supabase
    .from('agent_conversations')
    .select('id, gmail_thread_id, contact_email, subject')
    .eq('id', params.id).single()
  if (!convo?.gmail_thread_id || !convo.contact_email) {
    return NextResponse.json({ error: 'Not an email conversation' }, { status: 400 })
  }

  const subject = String(payload?.subject ?? '').trim().slice(0, 300) || convo.subject || 'Made Kulture'

  // An empty body is fine when the point of the email IS the attachment, but
  // sending nothing at all is always a mistake.
  const { data: pending } = await supabase
    .from('email_attachments')
    .select('id')
    .eq('conversation_id', params.id).eq('direction', 'out').is('message_id', null)
  if (!text && !(pending ?? []).length) {
    return NextResponse.json({ error: 'Write something or attach a file' }, { status: 400 })
  }

  const finalBody = text + await signatureFor(params.id)

  // Insert first so the attachments have a message to link to, and so a send
  // failure leaves a visible record rather than silently losing what you typed.
  const { data: msg, error: insErr } = await supabase.from('agent_messages').insert({
    conversation_id: params.id,
    role: 'teddy',
    content: finalBody,
    cc_emails: cc.length ? cc : null,
    bcc_emails: bcc.length ? bcc : null,
  }).select('id').single()
  if (insErr || !msg) return NextResponse.json({ error: insErr?.message ?? 'Could not save the message' }, { status: 500 })

  // Thread onto the most recent inbound Gmail message so it lands in the chain.
  const { data: lastInbound } = await supabase
    .from('agent_messages')
    .select('external_id')
    .eq('conversation_id', convo.id).eq('role', 'user').not('external_id', 'is', null)
    .order('created_at', { ascending: false }).limit(1).maybeSingle()

  try {
    const { sentId, attachmentCount, sentBody } = await sendConversationEmail({
      conversationId: params.id,
      messageId: msg.id,
      threadId: convo.gmail_thread_id,
      to: convo.contact_email,
      subject,
      body: finalBody,
      cc, bcc,
      inReplyToMsgId: lastInbound?.external_id ?? undefined,
    })

    // Store what actually went out, not what was typed — the transcript should
    // match the customer's inbox exactly.
    await supabase.from('agent_messages')
      .update({ external_id: sentId, content: sentBody })
      .eq('id', msg.id)
    await supabase.from('agent_conversations')
      .update({ human_takeover: true, status: 'open', subject, last_message_at: new Date().toISOString() })
      .eq('id', convo.id)

    return NextResponse.json({ success: true, attachmentCount })
  } catch (e: any) {
    // Roll the placeholder back so a failed send doesn't leave a message in the
    // transcript claiming it went out.
    await supabase.from('agent_messages').delete().eq('id', msg.id)
    console.error('[inbox email send] error:', e)
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 })
  }
}
