import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const service = createService(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/messages/start { toUserId } — get or create the 1:1 conversation
// with another member. Returns { conversationId }.
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { toUserId } = await req.json().catch(() => ({}))
  if (!toUserId || typeof toUserId !== 'string') {
    return NextResponse.json({ error: 'toUserId is required' }, { status: 400 })
  }
  if (toUserId === user.id) {
    return NextResponse.json({ error: "You can't message yourself." }, { status: 400 })
  }

  // Members-only: both parties must be listed in the directory.
  const { data: parts } = await service
    .from('customer_profiles').select('id, directory_opt_in').in('id', [user.id, toUserId])
  const me = parts?.find(p => p.id === user.id)
  const them = parts?.find(p => p.id === toUserId)
  if (!me?.directory_opt_in) return NextResponse.json({ error: 'Join the directory to message members.' }, { status: 403 })
  if (!them) return NextResponse.json({ error: 'Member not found.' }, { status: 404 })

  const [a, b] = [user.id, toUserId].sort()

  const { data: existing } = await service
    .from('conversations').select('id').eq('user_a', a).eq('user_b', b).maybeSingle()
  if (existing) return NextResponse.json({ conversationId: existing.id })

  const { data: created, error } = await service
    .from('conversations').insert({ user_a: a, user_b: b }).select('id').single()
  if (error) {
    // Lost a race — fetch the row the other insert created.
    const { data: again } = await service
      .from('conversations').select('id').eq('user_a', a).eq('user_b', b).maybeSingle()
    if (again) return NextResponse.json({ conversationId: again.id })
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ conversationId: created.id })
}
