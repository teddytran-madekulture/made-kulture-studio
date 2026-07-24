import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { clockIn, clockOut } from '@/lib/shifts'

export const dynamic = 'force-dynamic'

// POST /api/work/shifts/[id]/clock — body { action: 'in' | 'out' }.
// Clock-in opens 30 min before start through the end time; clock-out is gated
// on at least one closeout photo (enforced in lib/shifts).
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({})) as { action?: string }
  if (body.action !== 'in' && body.action !== 'out') {
    return NextResponse.json({ error: 'action must be "in" or "out"' }, { status: 400 })
  }
  const r = body.action === 'in'
    ? await clockIn(user.id, params.id)
    : await clockOut(user.id, params.id)
  if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 })
  return NextResponse.json({ success: true })
}
