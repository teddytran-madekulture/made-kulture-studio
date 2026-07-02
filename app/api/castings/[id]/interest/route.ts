import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const service = createService(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/castings/<id>/interest — express interest AND open a conversation
// with the casting's author. Returns { conversationId } so the UI can jump to it.
export async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: me } = await service
    .from('customer_profiles').select('directory_opt_in').eq('id', user.id).maybeSingle()
  if (!me?.directory_opt_in) return NextResponse.json({ error: 'Join the directory to respond.' }, { status: 403 })

  const { data: c } = await service.from('castings').select('author_id, status').eq('id', params.id).maybeSingle()
  if (!c) return NextResponse.json({ error: 'Casting not found.' }, { status: 404 })
  if (c.author_id === user.id) return NextResponse.json({ error: "This is your casting." }, { status: 400 })

  // Register interest (idempotent).
  await service.from('casting_participants')
    .upsert({ casting_id: params.id, user_id: user.id, status: 'interested' }, { onConflict: 'casting_id,user_id', ignoreDuplicates: true })

  // Open (or find) the conversation with the author.
  const [a, b] = [user.id, c.author_id].sort()
  let conversationId: string | null = null
  const { data: existing } = await service
    .from('conversations').select('id').eq('user_a', a).eq('user_b', b).maybeSingle()
  if (existing) conversationId = existing.id
  else {
    const { data: created } = await service.from('conversations').insert({ user_a: a, user_b: b }).select('id').single()
    conversationId = created?.id ?? null
    if (!conversationId) {
      const { data: again } = await service.from('conversations').select('id').eq('user_a', a).eq('user_b', b).maybeSingle()
      conversationId = again?.id ?? null
    }
  }

  return NextResponse.json({ ok: true, conversationId })
}
