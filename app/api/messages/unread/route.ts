import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { unreadMessageCount } from '@/lib/member-badge'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'


// GET /api/messages/unread — total unread message count for the nav badge.
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ unread: 0 })

  let total = 0
  try { total = await unreadMessageCount(user.id) } catch (e) { console.error('[messages/unread]', (e as Error).message) }
  return NextResponse.json({ unread: total })
}
