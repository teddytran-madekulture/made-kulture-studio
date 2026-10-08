// /api/directory/block — block or unblock another member (migration 148).
//   GET                 → { blocked: [{ id, name, avatar_url, at }] } (people I blocked)
//   POST   { userId }   → block them
//   DELETE ?userId=…    → unblock them
// Blocking never tells the other member. Teddy gets a quiet push so he can
// look at the pair if something is going on (App Store guideline 1.2).
import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { sendOwnerPush } from '@/lib/push'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const service = createService(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const UUID = /^[0-9a-f-]{36}$/i

async function me() {
  const { data: { user } } = await createClient().auth.getUser()
  return user
}

export async function GET() {
  const user = await me()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await service.from('member_blocks')
    .select('blocked_id, created_at').eq('blocker_id', user.id).order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: 'Could not load blocked members.' }, { status: 500 })
  const ids = (data ?? []).map(r => r.blocked_id)
  const names = new Map<string, { full_name: string | null; avatar_url: string | null }>()
  if (ids.length) {
    const { data: profs } = await service.from('customer_profiles').select('id, full_name, avatar_url').in('id', ids)
    for (const p of profs ?? []) names.set(p.id, p)
  }
  return NextResponse.json({
    blocked: (data ?? []).map(r => ({ id: r.blocked_id, name: names.get(r.blocked_id)?.full_name || '(member)', avatar_url: names.get(r.blocked_id)?.avatar_url ?? null, at: r.created_at })),
  })
}

export async function POST(req: NextRequest) {
  const user = await me()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { userId } = await req.json().catch(() => ({}))
  if (typeof userId !== 'string' || !UUID.test(userId)) return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  if (userId === user.id) return NextResponse.json({ error: "You can't block yourself." }, { status: 400 })

  const { error } = await service.from('member_blocks')
    .upsert({ blocker_id: user.id, blocked_id: userId }, { onConflict: 'blocker_id,blocked_id', ignoreDuplicates: true })
  if (error) return NextResponse.json({ error: 'Could not block this member. Try again.' }, { status: 500 })

  // Unfollow both ways so a blocked member doesn't linger in follower lists.
  await service.from('follows').delete().eq('follower_id', user.id).eq('following_id', userId)
  await service.from('follows').delete().eq('follower_id', userId).eq('following_id', user.id)

  try {
    const { data: ps } = await service.from('customer_profiles').select('id, full_name').in('id', [user.id, userId])
    const n = (id: string) => ps?.find(p => p.id === id)?.full_name || 'a member'
    await sendOwnerPush({ title: 'Member blocked', body: `${n(user.id)} blocked ${n(userId)}`, url: `/account/directory/${userId}`, tag: 'member-block' })
  } catch { /* the block itself already worked */ }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const user = await me()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userId = req.nextUrl.searchParams.get('userId') ?? ''
  if (!UUID.test(userId)) return NextResponse.json({ error: 'userId is required' }, { status: 400 })
  const { error } = await service.from('member_blocks').delete().eq('blocker_id', user.id).eq('blocked_id', userId)
  if (error) return NextResponse.json({ error: 'Could not unblock. Try again.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}
