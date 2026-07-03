// Admin — count of items needing Teddy (app icon badge).
// = conversations flagged needs_teddy + pending email drafts + pending tours.

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const [convos, drafts, tours] = await Promise.all([
    supabase.from('agent_conversations').select('id', { count: 'exact', head: true }).eq('status', 'needs_teddy').eq('human_takeover', false),
    supabase.from('agent_messages').select('id', { count: 'exact', head: true }).eq('role', 'draft'),
    supabase.from('tour_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ])
  const inbox = (convos.count ?? 0) + (drafts.count ?? 0)
  const toursPending = tours.count ?? 0
  return NextResponse.json({ count: inbox + toursPending, inbox, tours: toursPending })
}
