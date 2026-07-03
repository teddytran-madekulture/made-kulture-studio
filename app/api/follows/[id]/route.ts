import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const service = createService(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/follows/<id>?type=followers|following
// Members who follow <id>, or who <id> follows. Directory members only.
export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to view this.' }, { status: 401 })

  const { data: me } = await service.from('customer_profiles').select('directory_opt_in').eq('id', user.id).maybeSingle()
  if (!me?.directory_opt_in) return NextResponse.json({ error: 'Join the directory to view this.', optedOut: true }, { status: 403 })

  const type = req.nextUrl.searchParams.get('type') === 'following' ? 'following' : 'followers'

  let ids: string[] = []
  if (type === 'followers') {
    const { data } = await service.from('follows').select('follower_id').eq('following_id', params.id)
    ids = (data ?? []).map(r => r.follower_id)
  } else {
    const { data } = await service.from('follows').select('following_id').eq('follower_id', params.id)
    ids = (data ?? []).map(r => r.following_id)
  }
  if (!ids.length) return NextResponse.json({ members: [] })

  const { data: profs } = await service
    .from('customer_profiles').select('id, full_name, avatar_url, roles, directory_opt_in').in('id', ids)
  const members = (profs ?? [])
    .filter(p => p.directory_opt_in)
    .map(p => ({ id: p.id, name: p.full_name || '(member)', avatar_url: p.avatar_url || null, roles: p.roles ?? [] }))

  return NextResponse.json({ members })
}
