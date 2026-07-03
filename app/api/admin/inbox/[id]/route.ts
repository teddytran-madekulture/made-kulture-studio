// Admin — single June conversation: transcript + reply as Teddy.

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/admin/inbox/[id] → full transcript
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [{ data: convo }, { data: messages }] = await Promise.all([
    supabase.from('agent_conversations')
      .select('id, channel, status, human_takeover, visitor_name, visitor_email, page, created_at')
      .eq('id', params.id).single(),
    supabase.from('agent_messages')
      .select('id, role, content, created_at')
      .eq('conversation_id', params.id)
      .order('created_at', { ascending: true })
      .limit(500),
  ])
  if (!convo) return NextResponse.json({ error: 'not found' }, { status: 404 })
  return NextResponse.json({ conversation: convo, messages: messages ?? [] })
}

// POST /api/admin/inbox/[id] { message } → reply as Teddy (auto-takes over)
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
