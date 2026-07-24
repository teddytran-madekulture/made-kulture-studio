import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { WORKER_CLASSES } from '@/lib/onboarding'
import { getShiftsAdmin } from '@/lib/shifts'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/admin/shifts — the full board (every shift, soonest first).
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    return NextResponse.json({ shifts: await getShiftsAdmin() })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load shifts.' }, { status: 500 })
  }
}

// POST /api/admin/shifts — post a new shift for a role.
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let b: any
  try { b = await req.json() } catch { return NextResponse.json({ error: 'Bad request.' }, { status: 400 }) }

  const worker_class = String(b.worker_class || '')
  if (!(WORKER_CLASSES as string[]).includes(worker_class)) return NextResponse.json({ error: 'Pick a role.' }, { status: 400 })

  const starts = new Date(b.starts_at)
  const ends = new Date(b.ends_at)
  if (isNaN(starts.getTime()) || isNaN(ends.getTime())) return NextResponse.json({ error: 'Enter a start and end time.' }, { status: 400 })
  if (ends.getTime() <= starts.getTime()) return NextResponse.json({ error: 'End time must be after the start time.' }, { status: 400 })

  const { data, error } = await supabaseAdmin().from('shifts').insert({
    starts_at: starts.toISOString(),
    ends_at: ends.toISOString(),
    worker_class,
    notes: String(b.notes || '').trim(),
  }).select('id').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true, id: data?.id })
}
