import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const service = createService(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/messages/conversations — my threads, newest first, each enriched with
// the other member (name, avatar), the last message, and my unread count.
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: convs } = await service
    .from('conversations')
    .select('id, user_a, user_b, last_message_at, last_read_a, last_read_b')
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)
    .order('last_message_at', { ascending: false, nullsFirst: false })

  const list = convs ?? []
  const otherIds = [...new Set(list.map(c => (c.user_a === user.id ? c.user_b : c.user_a)))]
  const profs: Record<string, { full_name: string | null; avatar_url: string | null }> = {}
  if (otherIds.length) {
    const { data } = await service
      .from('customer_profiles').select('id, full_name, avatar_url').in('id', otherIds)
    for (const p of data ?? []) profs[p.id] = { full_name: p.full_name, avatar_url: p.avatar_url }
  }

  const conversations = []
  let totalUnread = 0
  for (const c of list) {
    const otherId = c.user_a === user.id ? c.user_b : c.user_a
    const myRead = c.user_a === user.id ? c.last_read_a : c.last_read_b

    const { data: last } = await service
      .from('messages').select('body, sender_id, created_at')
      .eq('conversation_id', c.id).order('created_at', { ascending: false }).limit(1).maybeSingle()

    let q = service.from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', c.id).neq('sender_id', user.id)
    if (myRead) q = q.gt('created_at', myRead)
    const { count } = await q
    const unread = count ?? 0
    totalUnread += unread

    conversations.push({
      id: c.id,
      other: { id: otherId, name: profs[otherId]?.full_name || '(member)', avatar_url: profs[otherId]?.avatar_url || null },
      last: last ? { body: last.body, fromMe: last.sender_id === user.id, at: last.created_at } : null,
      unread,
    })
  }

  return NextResponse.json({ conversations, totalUnread })
}
