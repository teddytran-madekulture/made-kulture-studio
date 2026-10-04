// POST /api/push/member/test — send the signed-in member a test notification,
// and say honestly how many devices ACCEPTED it (accepted ≠ seen).
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { sendMemberPush, memberPushConfigured } from '@/lib/member-push'

export const dynamic = 'force-dynamic'

export async function POST() {
  const { data: { user } } = await createClient().auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!memberPushConfigured()) return NextResponse.json({ error: 'Notifications aren’t set up on the server yet.' }, { status: 503 })
  const accepted = await sendMemberPush(user.id, { title: 'Made Kulture', body: 'Notifications are on. You’ll hear about messages and requests here.', url: '/account', tag: 'test' })
  return NextResponse.json({ accepted })
}
