// GET /api/cron/agent-email — June's email poller (pg_cron, every 5 minutes).
//
// For each new email to june@madekulture.com:
//   1. find-or-create an agent conversation (channel 'email', keyed by thread)
//   2. store the inbound message
//   3. June writes a reply — stored as role 'draft' (NOT sent)
//   4. Teddy gets an SMS; he approves/edits/discards in /admin/inbox
//
// Email is draft-tier by design: nothing sends without approval.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { fetchNewEmails, markProcessed, juneEmailConfigured } from '@/lib/agent/gmail'
import { runJune, juneConfigured, JuneTurn } from '@/lib/agent/june'
import { sendOwnerSMS } from '@/lib/sms'
import { sendOwnerPush } from '@/lib/push'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const maxDuration = 60

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (!juneEmailConfigured() || !juneConfigured()) {
    return NextResponse.json({ ok: true, skipped: 'not configured' })
  }

  // Kill switch applies to email too.
  const { data: setting } = await supabase
    .from('studio_settings').select('value').eq('key', 'cs_agent_enabled').single()
  if (setting?.value !== 'true') return NextResponse.json({ ok: true, skipped: 'agent disabled' })

  let processed = 0
  let drafted = 0

  try {
    const emails = await fetchNewEmails(5)

    for (const em of emails) {
      // Dedupe (poller overlap safety).
      const { data: dupe } = await supabase
        .from('agent_messages').select('id').eq('external_id', em.gmailMsgId).maybeSingle()
      if (dupe) { await markProcessed(em.gmailMsgId); continue }

      // Find-or-create the conversation for this thread.
      let convoId: string | null = null
      const { data: existing } = await supabase
        .from('agent_conversations').select('id, status').eq('gmail_thread_id', em.threadId).maybeSingle()
      if (existing) {
        convoId = existing.id
        await supabase.from('agent_conversations')
          .update({ status: 'open', last_message_at: new Date().toISOString() })
          .eq('id', existing.id)
      } else {
        const { data: created } = await supabase
          .from('agent_conversations')
          .insert({
            token: `email-${em.threadId}`,
            channel: 'email',
            gmail_thread_id: em.threadId,
            contact_email: em.fromEmail,
            visitor_name: em.fromName,
            visitor_email: em.fromEmail,
            subject: em.subject,
          })
          .select('id').single()
        convoId = created?.id ?? null
      }
      if (!convoId) continue

      // Store inbound.
      await supabase.from('agent_messages').insert({
        conversation_id: convoId,
        role: 'user',
        content: `[Email] Subject: ${em.subject}\n\n${em.text}`,
        external_id: em.gmailMsgId,
      })
      await markProcessed(em.gmailMsgId)
      processed++

      // June drafts a reply from the full thread history.
      const { data: historyRows } = await supabase
        .from('agent_messages')
        .select('role, content')
        .eq('conversation_id', convoId)
        .order('created_at', { ascending: true })
        .limit(30)

      try {
        const result = await runJune({
          supabase,
          conversationId: convoId,
          history: (historyRows ?? []).map((m: any) =>
            m.role === 'draft' ? { ...m, role: 'agent' } : m) as JuneTurn[],
          authUserId: null,
          visitorName: em.fromName,
          page: `email:${em.subject}`,
        })
        await supabase.from('agent_messages').insert({
          conversation_id: convoId,
          role: 'draft',
          content: result.reply,
        })
        await supabase.from('agent_conversations')
          .update({ status: 'needs_teddy', last_message_at: new Date().toISOString() })
          .eq('id', convoId)
        drafted++
      } catch (e) {
        console.error('[agent-email] June draft error:', e)
        await supabase.from('agent_conversations')
          .update({ status: 'needs_teddy' }).eq('id', convoId)
      }
    }

    if (drafted > 0) {
      await sendOwnerSMS(
        `📬 June drafted ${drafted} email repl${drafted === 1 ? 'y' : 'ies'} — review in Admin → June Inbox.`
      ).catch(e => console.error('[agent-email] owner SMS error:', e))
      await sendOwnerPush({
        title: '📬 June drafted a reply',
        body: `${drafted} email draft${drafted === 1 ? '' : 's'} waiting for your approval.`,
        url: '/admin/inbox',
        tag: 'june-email-drafts',
      })
    }
  } catch (e: any) {
    console.error('[agent-email] poll error:', e)
    return NextResponse.json({ ok: false, error: String(e?.message || e), processed, drafted }, { status: 500 })
  }

  return NextResponse.json({ ok: true, processed, drafted })
}
