import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { unreadMessageCount } from '@/lib/member-badge'
import { unreadGigReplyCount } from '@/lib/gig-threads'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'


// GET /api/messages/unread — total unread message count for the nav badge.
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ unread: 0 })

  let total = 0
  try { total = await unreadMessageCount(user.id) } catch (e) { console.error('[messages/unread]', (e as Error).message) }
  // Company replies on gigs I applied to are listed in Messages, so they count here.
  try { total += await unreadGigReplyCount(user.id) } catch (e) { console.error('[messages/unread] gig replies', (e as Error).message) }
  return NextResponse.json({ unread: total })
}
