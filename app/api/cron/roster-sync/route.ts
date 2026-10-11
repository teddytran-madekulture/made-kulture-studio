// GET /api/cron/roster-sync — nightly refresh of every company roster
// (migration 165) that isn't switched off. Drafts sync too, so the admin
// preview is current the day a company says yes.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { syncRoster } from '@/lib/roster-sync'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  if (!process.env.CRON_SECRET || req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { data: rosters, error } = await db.from('company_rosters').select('id').neq('status', 'hidden')
  if (error) {
    console.error('[roster-sync] list failed:', error.message)
    return NextResponse.json({ error: 'list failed' }, { status: 500 })
  }
  const results: Record<string, unknown> = {}
  for (const r of rosters ?? []) {
    const res = await syncRoster(db, r.id)
    if (!res.ok) console.warn('[roster-sync]', r.id, res.error)
    results[r.id] = res
  }
  return NextResponse.json({ ok: true, rosters: (rosters ?? []).length, results })
}
