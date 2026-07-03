// Admin — June's inbox. List conversations + conversation-level actions.

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/admin/inbox → conversations (newest activity first) + last message preview
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: convos, error } = await supabase
    .from('agent_conversations')
    .select('id, channel, status, human_takeover, visitor_name, visitor_email, page, last_message_at, created_at')
    .order('last_message_at', { ascending: false })
    .limit(100)
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
  })
}

// PATCH /api/admin/inbox { id, action: 'takeover' | 'release' | 'close' | 'reopen' }
export async function PATCH(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id, action } = await req.json()
  if (!id || !action) return NextResponse.json({ error: 'id and action required' }, { status: 400 })

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
