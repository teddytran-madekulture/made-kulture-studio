import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getWorkerShiftView } from '@/lib/shifts'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/work/shifts — the signed-in worker's eligibility, the open shifts
// they can claim, and the shifts they've already claimed.
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  return NextResponse.json(await getWorkerShiftView(user.id))
}
