// GET /api/castings/unseen — how many people applied to MY castings that I
// haven't looked at yet. Feeds the red badge on the Castings icon
// (components/AccountRail). Opening a casting clears its rows
// (GET /api/castings/[id] stamps seen_by_author_at). Migration 142.
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { unseenApplicantCount } from '@/lib/member-badge'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'


export async function GET() {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ unseen: 0 })
  let unseen = 0
  try { unseen = await unseenApplicantCount(user.id) } catch (e) { console.error('[castings/unseen]', (e as Error).message) }
  return NextResponse.json({ unseen })
}
