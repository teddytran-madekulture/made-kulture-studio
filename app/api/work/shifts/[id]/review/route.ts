import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { submitWorkerReview } from '@/lib/reviews'

export const dynamic = 'force-dynamic'

// POST /api/work/shifts/[id]/review — the worker rates their finished shift.
// Body { rating: 1-5, note?: string }. Must own the shift; upserts.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({})) as { rating?: number; note?: string }
  const r = await submitWorkerReview(user.id, params.id, Number(b.rating), String(b.note ?? ''))
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ success: true })
}
