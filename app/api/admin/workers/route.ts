import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { getRoster } from '@/lib/onboarding'
import { getReliabilityMap } from '@/lib/reviews'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/admin/workers — the full worker roster with per-module onboarding
// progress, an overall certified flag, and a computed reliability summary
// (attendance + studio rating), newest applicant first.
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const [roster, reliability] = await Promise.all([getRoster(), getReliabilityMap()])
    const workers = roster.map(w => ({ ...w, reliability: reliability.get(w.id) ?? null }))
    return NextResponse.json({ workers })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load roster.' }, { status: 500 })
  }
}
