import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

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

  const { data: me } = await service.from('customer_profiles').select('directory_opt_in').eq('id', user.id).maybeSingle()
  if (!me?.directory_opt_in) return NextResponse.json({ error: 'Join the directory to follow members.' }, { status: 403 })

  const { targetId } = await req.json().catch(() => ({}))
  if (!targetId || targetId === user.id) return NextResponse.json({ error: 'Invalid target.' }, { status: 400 })

  const { data: t } = await service.from('customer_profiles').select('directory_opt_in').eq('id', targetId).maybeSingle()
  if (!t?.directory_opt_in) return NextResponse.json({ error: 'Member not found.' }, { status: 404 })

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
