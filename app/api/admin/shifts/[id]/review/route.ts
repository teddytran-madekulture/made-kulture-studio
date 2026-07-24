import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { submitStudioReview } from '@/lib/reviews'

export const dynamic = 'force-dynamic'

// POST /api/admin/shifts/[id]/review — the studio rates the worker who did the
// shift. Body { rating: 1-5, note?: string }. Upserts (one review per shift).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const b = await req.json().catch(() => ({})) as { rating?: number; note?: string }
  const r = await submitStudioReview(params.id, Number(b.rating), String(b.note ?? ''))
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ success: true })
}
