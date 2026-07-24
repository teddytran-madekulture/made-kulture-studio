import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { getRoster } from '@/lib/onboarding'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/admin/workers — the full worker roster with per-module onboarding
// progress and an overall certified flag, newest applicant first.
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  try {
    const workers = await getRoster()
    return NextResponse.json({ workers })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed to load roster.' }, { status: 500 })
  }
}
