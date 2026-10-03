// GET /api/cron/projector-clear — wipe the projector wall after closing.
// (Teddy, 2026-10-03.) A guest's personal photo or clip must never carry over
// to the next morning's session, so the folder is emptied each night and the
// wall goes back to its QR.
//
// Runs hourly 10 PM–4 AM Central (03:00–09:00 UTC covers both CDT and CST).
// ⚠️ Skips any hour a booking is IN PROGRESS — an after-hours buyout may be
// shooting against the wall. It clears on the first run after they finish.
import { NextRequest, NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { listProjectorFiles, removeProjectorFiles } from '@/lib/projector'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(req: NextRequest) {
  if (req.headers.get('authorization') !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const hour = Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', hour: '2-digit', hour12: false }).format(new Date())) % 24
  if (hour >= 5 && hour < 22) return NextResponse.json({ cleared: 0, skipped: 'open hours' })

  const nowIso = new Date().toISOString()
  const { data: live, error } = await supabaseAdmin().from('bookings')
    .select('id').eq('status', 'confirmed').lte('start_time', nowIso).gt('end_time', nowIso).limit(1)
  // A failed lookup must not read as "nobody's here" — skip and try next hour.
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (live?.length) return NextResponse.json({ cleared: 0, skipped: 'session in progress' })

  try {
    const names = await listProjectorFiles()
    await removeProjectorFiles(names)
    return NextResponse.json({ cleared: names.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
