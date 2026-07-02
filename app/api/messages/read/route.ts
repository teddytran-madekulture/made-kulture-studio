import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

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
    .from('conversations').select('user_a, user_b').eq('id', conversationId).maybeSingle()
  if (!c || (c.user_a !== user.id && c.user_b !== user.id)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  const col = c.user_a === user.id ? 'last_read_a' : 'last_read_b'
  await service.from('conversations').update({ [col]: new Date().toISOString() }).eq('id', conversationId)
  return NextResponse.json({ ok: true })
}
