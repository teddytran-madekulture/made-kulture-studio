import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'
import { memberAccess, notListedResponse } from '@/lib/directory-access'

export const dynamic = 'force-dynamic'

const service = createService(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// Follow a member. POST { targetId }
export async function POST(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const me = await memberAccess(service, user.id)
  if (!me.listed) return notListedResponse(me, 'follow members')

  const { targetId } = await req.json().catch(() => ({}))
  if (!targetId || targetId === user.id) return NextResponse.json({ error: 'Invalid target.' }, { status: 400 })

  if (!(await memberAccess(service, targetId)).listed) return NextResponse.json({ error: 'Member not found.' }, { status: 404 })

  const { error } = await service.from('follows')
    .upsert({ follower_id: user.id, following_id: targetId }, { onConflict: 'follower_id,following_id' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, following: true })
}

// Unfollow a member. DELETE { targetId }
export async function DELETE(req: NextRequest) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { targetId } = await req.json().catch(() => ({}))
  if (!targetId) return NextResponse.json({ error: 'Invalid target.' }, { status: 400 })

  const { error } = await service.from('follows').delete()
    .eq('follower_id', user.id).eq('following_id', targetId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, following: false })
}
