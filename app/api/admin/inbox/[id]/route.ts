// Admin — single June conversation: transcript + reply as Teddy.

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/admin/inbox/[id] → full transcript + attachments
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: convo }, msgRes, attRes] = await Promise.all([
    supabase.from('agent_conversations')
      .select('id, channel, status, human_takeover, visitor_name, visitor_email, page, subject, contact_email, created_at')
      .eq('id', params.id).single(),
    supabase.from('agent_messages')
      .select('id, role, content, created_at, cc_emails, bcc_emails')
      .eq('conversation_id', params.id)
      .order('created_at', { ascending: true })
      .limit(500),
    supabase.from('email_attachments')
      .select('id, message_id, direction, filename, mime_type, size_bytes')
      .eq('conversation_id', params.id)
      .order('created_at', { ascending: true }),
  ])
  if (!convo) return NextResponse.json({ error: 'not found' }, { status: 404 })

  // NEVER coalesce a failed transcript query to an empty array. Doing that once
  // turned "migration 090 hasn't run yet" into a screen that read as "all your
  // email is gone" — the transcript must fail loudly or not at all.
  if (msgRes.error) {
    console.error('[inbox transcript] query failed:', msgRes.error.message)
    return NextResponse.json(
      { error: `Couldn't load this conversation: ${msgRes.error.message}` },
      { status: 500 }
    )
  }

  // Attachments are additive — if that table isn't there yet, you should still
  // be able to read your mail.
  if (attRes.error) console.error('[inbox attachments] query failed:', attRes.error.message)
  const all = attRes.data ?? []

  return NextResponse.json({
    conversation: convo,
    messages: msgRes.data ?? [],
    // Files already delivered, grouped by the message they belong to.
    attachments: all.filter(a => a.message_id),
    // Files staged for the next outgoing email but not sent yet.
    pendingAttachments: all.filter(a => !a.message_id && a.direction === 'out'),
  })
}

// POST /api/admin/inbox/[id] { message } → reply as Teddy (auto-takes over)
// Web-chat channel only; email threads go through /api/admin/inbox/[id]/email.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { message } = await req.json()
  const text = String(message ?? '').trim().slice(0, 2000)
  if (!text) return NextResponse.json({ error: 'empty message' }, { status: 400 })

  const { error } = await supabase.from('agent_messages')
    .insert({ conversation_id: params.id, role: 'teddy', content: text })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await supabase.from('agent_conversations')
    .update({ human_takeover: true, status: 'open', last_message_at: new Date().toISOString() })
    .eq('id', params.id)

  return NextResponse.json({ success: true })
}
