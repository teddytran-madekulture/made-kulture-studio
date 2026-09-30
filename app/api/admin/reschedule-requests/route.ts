// GET /api/admin/reschedule-requests — pending requests for the dashboard banner.
// Stale ones (either start time passed) are marked expired here and left out.
import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { RR_COLS, isExpired, type RescheduleRequestRow } from '@/lib/reschedule-requests'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const db = supabaseAdmin()
  const { data, error } = await db
    .from('reschedule_requests').select(RR_COLS)
    .eq('status', 'pending').order('created_at', { ascending: true })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = (data ?? []) as unknown as RescheduleRequestRow[]
  const stale = rows.filter(r => isExpired(r)).map(r => r.id)
  if (stale.length) {
    await db.from('reschedule_requests')
      .update({ status: 'expired', decided_at: new Date().toISOString() })
      .in('id', stale).eq('status', 'pending')
  }
  return NextResponse.json({ requests: rows.filter(r => !stale.includes(r.id)) })
}
