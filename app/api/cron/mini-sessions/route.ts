// GET /api/cron/mini-sessions — hourly. Follows moved/cancelled bookings, sends
// the morning-of reminders (from 7 AM Central), and clears client contact
// details 90 days after the session. See lib/mini-sessions-server runMiniUpkeep.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { runMiniUpkeep } from '@/lib/mini-sessions-server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json({ ok: true, ...(await runMiniUpkeep(supabaseAdmin())) })
  } catch (e: any) {
    console.error('[cron/mini-sessions]', e)
    return NextResponse.json({ error: e?.message ?? 'failed' }, { status: 500 })
  }
}
