// Admin — June's inbox. List conversations + conversation-level actions.

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { juneEmailConfigured, setThreadSpam } from '@/lib/agent/gmail'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/admin/inbox            → conversations, spam hidden (newest activity first)
// GET /api/admin/inbox?view=spam  → only the conversations marked as spam
// Both carry spamCount so the SPAM toggle can show a number without a 2nd call.
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const spamView = req.nextUrl.searchParams.get('view') === 'spam'
  let q = supabase
    .from('agent_conversations')
    .select('id, channel, status, human_takeover, visitor_name, visitor_email, page, subject, last_message_at, created_at')
  q = spamView ? q.eq('status', 'spam') : q.neq('status', 'spam')
  const [{ data: convos, error }, spam] = await Promise.all([
    q.order('last_message_at', { ascending: false }).limit(100),
    supabase.from('agent_conversations').select('id', { count: 'exact', head: true }).eq('status', 'spam'),
  ])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Last message per conversation (one query, newest 300 msgs across the board).
  const ids = (convos ?? []).map(c => c.id)
  const previews: Record<string, string> = {}
  if (ids.length) {
    const { data: msgs } = await supabase
      .from('agent_messages')
      .select('conversation_id, content, created_at')
      .in('conversation_id', ids)
      .order('created_at', { ascending: false })
      .limit(300)
    for (const m of msgs ?? []) {
      if (!previews[m.conversation_id]) previews[m.conversation_id] = m.content.slice(0, 90)
    }
  }

  return NextResponse.json({
    conversations: (convos ?? []).map(c => ({ ...c, preview: previews[c.id] ?? '' })),
    spamCount: spam.count ?? 0,
  })
}

// PATCH /api/admin/inbox { id, action: 'takeover' | 'release' | 'close' | 'reopen' | 'spam' | 'unspam' | 'noreply' | 'needsreply' }
export async function PATCH(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, action } = await req.json()
  if (!id || !action) return NextResponse.json({ error: 'id and action required' }, { status: 400 })

  if (action === 'spam' || action === 'unspam') return spamAction(id, action === 'spam')
  if (action === 'noreply' || action === 'needsreply') return noReplyAction(id, action === 'noreply')

  const updates: Record<string, any> =
    action === 'takeover' ? { human_takeover: true } :
    action === 'release'  ? { human_takeover: false, status: 'open' } :
    action === 'close'    ? { status: 'closed', human_takeover: false } :
    action === 'reopen'   ? { status: 'open' } :
    {}
  if (!Object.keys(updates).length) return NextResponse.json({ error: 'bad action' }, { status: 400 })

  const { error } = await supabase.from('agent_conversations').update(updates).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}

// SPAM in one tap: throw away June's pending draft, hide the conversation, and
// (for email) move the thread to Spam in the june@ mailbox. Before this, clearing
// one piece of spam took two actions — DISCARD the draft and CLOSE the thread —
// because the badge counts those two things separately.
//
// It HIDES, it does not delete: a real customer marked by mistake comes back with
// NOT SPAM. Hard deletion is the separate EMPTY SPAM (DELETE below).
async function spamAction(id: string, spam: boolean) {
  const { data: convo, error: readErr } = await supabase
    .from('agent_conversations').select('id, channel, gmail_thread_id').eq('id', id).maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!convo) return NextResponse.json({ error: 'not found' }, { status: 404 })

  if (spam) {
    const { error: delErr } = await supabase
      .from('agent_messages').delete().eq('conversation_id', id).eq('role', 'draft')
    if (delErr) return NextResponse.json({ error: `Couldn't discard the draft: ${delErr.message}` }, { status: 500 })
  }

  // .select() because a supabase-js update that matches nothing is not an error —
  // without it, a wrong id would report success and change nothing.
  const { data: updated, error } = await supabase.from('agent_conversations')
    .update(spam ? { status: 'spam', human_takeover: false } : { status: 'closed' })
    .eq('id', id).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!updated?.length) return NextResponse.json({ error: 'Nothing was updated' }, { status: 404 })

  // Gmail is the bonus, not the job — the inbox is already clean by this point, so
  // a Gmail failure is reported back but does not undo anything.
  let gmail: 'moved' | 'skipped' | 'failed' = 'skipped'
  let gmailError: string | undefined
  if (convo.channel === 'email' && convo.gmail_thread_id && juneEmailConfigured()) {
    try {
      await setThreadSpam(convo.gmail_thread_id, spam)
      gmail = 'moved'
    } catch (e: any) {
      gmail = 'failed'
      gmailError = String(e?.message || e).slice(0, 300)
      console.error('[inbox spam] gmail move failed:', gmailError)
    }
  }
  return NextResponse.json({ success: true, gmail, gmailError })
}

// NO REPLY — for mail that is real but needs no answer (a vendor's invoice, a
// receipt). One tap discards June's draft and files the thread as 'fyi': it stays
// in the inbox list and in Gmail, it just stops asking for attention. The SENDER
// is remembered too — the email poller files their next message straight to 'fyi'
// with no draft and no push (see app/api/cron/agent-email). Nothing moves in Gmail.
//
// NEEDS REPLY undoes it for the whole sender, not just this thread: every 'fyi'
// conversation from that address goes to 'closed', otherwise an older one would
// keep silencing them.
async function noReplyAction(id: string, quiet: boolean) {
  const { data: convo, error: readErr } = await supabase
    .from('agent_conversations').select('id, contact_email').eq('id', id).maybeSingle()
  if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
  if (!convo) return NextResponse.json({ error: 'not found' }, { status: 404 })

  if (quiet) {
    const { error: delErr } = await supabase
      .from('agent_messages').delete().eq('conversation_id', id).eq('role', 'draft')
    if (delErr) return NextResponse.json({ error: `Couldn't discard the draft: ${delErr.message}` }, { status: 500 })
  } else if (convo.contact_email) {
    const { error: liftErr } = await supabase.from('agent_conversations')
      .update({ status: 'closed' })
      .eq('contact_email', convo.contact_email).eq('status', 'fyi').neq('id', id)
    if (liftErr) return NextResponse.json({ error: liftErr.message }, { status: 500 })
  }

  const { data: updated, error } = await supabase.from('agent_conversations')
    .update(quiet ? { status: 'fyi', human_takeover: false } : { status: 'open' })
    .eq('id', id).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!updated?.length) return NextResponse.json({ error: 'Nothing was updated' }, { status: 404 })
  return NextResponse.json({ success: true, sender: convo.contact_email ?? null })
}

// DELETE /api/admin/inbox?view=spam → EMPTY SPAM. Permanently deletes every
// conversation marked spam; messages, attachment pointers and KB proposals go with
// them (all ON DELETE CASCADE). The Gmail copies stay in june@'s Spam folder,
// which Gmail empties on its own after 30 days.
export async function DELETE(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (req.nextUrl.searchParams.get('view') !== 'spam') {
    return NextResponse.json({ error: 'Only the spam folder can be emptied' }, { status: 400 })
  }
  const { data, error } = await supabase
    .from('agent_conversations').delete().eq('status', 'spam').select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, deleted: data?.length ?? 0 })
}
