import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { syncMemberBadge } from '@/lib/member-push'

export const dynamic = 'force-dynamic'

const service = createService(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/messages/read { conversationId } — mark a conversation read for me.
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { conversationId } = await req.json().catch(() => ({}))
  if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })

  const { data: c } = await service
    .from('conversations').select('user_a, user_b, last_read_a, last_read_b').eq('id', conversationId).maybeSingle()
  if (!c || (c.user_a !== user.id && c.user_b !== user.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const col = c.user_a === user.id ? 'last_read_a' : 'last_read_b'
  // Was anything actually unread here? ThreadView calls this on open AND on
  // every message that arrives while the thread is open, so only a read that
  // changes the count is worth an app-icon update (2026-10-23).
  const prevRead = c.user_a === user.id ? c.last_read_a : c.last_read_b
  let q = service.from('messages').select('id', { count: 'exact', head: true })
    .eq('conversation_id', conversationId).neq('sender_id', user.id)
  if (prevRead) q = q.gt('created_at', prevRead)
  const { count: hadUnread } = await q
  const { error } = await service.from('conversations').update({ [col]: new Date().toISOString() }).eq('id', conversationId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if ((hadUnread ?? 0) > 0) await syncMemberBadge(user.id)
  return NextResponse.json({ ok: true })
}
