// GET /api/castings/unseen — how many people applied to MY castings that I
// haven't looked at yet. Feeds the gold badge on the Castings icon
// (components/AccountRail). Opening a casting clears its rows
// (GET /api/castings/[id] stamps seen_by_author_at). Migration 142.
import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const service = createService(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET() {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ unseen: 0 })
  const { data: mine, error } = await service.from('castings').select('id').eq('author_id', user.id)
  if (error || !mine?.length) return NextResponse.json({ unseen: 0 })
  const { count } = await service.from('casting_participants')
    .select('user_id', { count: 'exact', head: true })
    .in('casting_id', mine.map(c => c.id))
    .eq('status', 'interested')
    .is('seen_by_author_at', null)
  return NextResponse.json({ unseen: count ?? 0 })
}
