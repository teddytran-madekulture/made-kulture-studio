import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const service = createService(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/messages/unread — total unread message count for the nav badge.
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ unread: 0 })

  const { data: convs } = await service
    .from('conversations')
    .select('id, user_a, user_b, last_read_a, last_read_b')
    .or(`user_a.eq.${user.id},user_b.eq.${user.id}`)

  let total = 0
  for (const c of convs ?? []) {
    const myRead = c.user_a === user.id ? c.last_read_a : c.last_read_b
    let q = service.from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('conversation_id', c.id).neq('sender_id', user.id)
    if (myRead) q = q.gt('created_at', myRead)
    const { count } = await q
    total += count ?? 0
  }
  return NextResponse.json({ unread: total })
}
