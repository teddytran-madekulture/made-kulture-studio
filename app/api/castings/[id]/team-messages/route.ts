import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const service = createService(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Team = the author + anyone confirmed on the casting.
async function membership(castingId: string, userId: string) {
  const { data: c } = await service.from('castings').select('author_id').eq('id', castingId).maybeSingle()
  if (!c) return { ok: false as const, status: 404, error: 'Casting not found.' }
  if (c.author_id === userId) return { ok: true as const, authorId: c.author_id }
  const { data: p } = await service.from('casting_participants')
    .select('status').eq('casting_id', castingId).eq('user_id', userId).maybeSingle()
  if (p?.status === 'confirmed') return { ok: true as const, authorId: c.author_id }
  return { ok: false as const, status: 403, error: 'This channel is for the confirmed team.' }
}

// GET — messages + team member directory. Marks the channel read for this user.
export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const m = await membership(params.id, user.id)
  if (!m.ok) return NextResponse.json({ error: m.error }, { status: m.status })

  const { data: confirmed } = await service.from('casting_participants')
    .select('user_id').eq('casting_id', params.id).eq('status', 'confirmed')
  const memberIds = [...new Set([m.authorId, ...(confirmed ?? []).map(p => p.user_id)])]

  const profById: Record<string, { full_name: string | null; avatar_url: string | null }> = {}
  if (memberIds.length) {
    const { data } = await service.from('customer_profiles')
      .select('id, full_name, avatar_url').in('id', memberIds)
    for (const p of data ?? []) profById[p.id] = { full_name: p.full_name, avatar_url: p.avatar_url }
  }
  const members = memberIds.map(mid => ({
    id: mid,
    name: profById[mid]?.full_name || '(member)',
    avatar_url: profById[mid]?.avatar_url || null,
    is_author: mid === m.authorId,
  }))

  const { data: messages } = await service.from('casting_messages')
    .select('id, sender_id, body, reply_to_id, created_at')
    .eq('casting_id', params.id).order('created_at', { ascending: true }).limit(300)

  // Mark read.
  await service.from('casting_reads')
    .upsert({ casting_id: params.id, user_id: user.id, last_read_at: new Date().toISOString() },
      { onConflict: 'casting_id,user_id' })

  return NextResponse.json({ me: user.id, members, messages: messages ?? [] })
}

// POST { body, replyToId? } — send a message to the team channel.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const m = await membership(params.id, user.id)
  if (!m.ok) return NextResponse.json({ error: m.error }, { status: m.status })

  const { body, replyToId } = await req.json().catch(() => ({}))
  const text = String(body ?? '').trim().slice(0, 2000)
  if (!text) return NextResponse.json({ error: 'Empty message.' }, { status: 400 })

  const { data: message, error } = await service.from('casting_messages')
    .insert({ casting_id: params.id, sender_id: user.id, body: text, reply_to_id: replyToId || null })
    .select('id, sender_id, body, reply_to_id, created_at').single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Sender is caught up on their own message.
  await service.from('casting_reads')
    .upsert({ casting_id: params.id, user_id: user.id, last_read_at: new Date().toISOString() },
      { onConflict: 'casting_id,user_id' })

  return NextResponse.json({ message })
}
