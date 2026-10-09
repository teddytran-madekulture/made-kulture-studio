// GET /api/cron/drop-choices — daily. A cancelled Set Drop with "customer's
// choice" promised: no answer within 7 days = refund. This keeps that promise.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { settleExpiredChoices } from '@/lib/set-drops-server'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    return NextResponse.json({ ok: true, ...(await settleExpiredChoices(supabaseAdmin())) })
  } catch (e: any) {
    console.error('[cron/drop-choices]', e)
    return NextResponse.json({ error: e?.message ?? 'failed' }, { status: 500 })
  }
}
