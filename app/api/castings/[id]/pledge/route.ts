import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const service = createService(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// POST /api/castings/<id>/pledge { pledgeType, pledgeValue }
// A confirmed member voluntarily pledges toward the studio cost. Display-only —
// no money is moved; the organizer settles up with the crew offline.
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { pledgeType, pledgeValue } = await req.json().catch(() => ({}))
  const type = ['none', 'amount', 'percent'].includes(pledgeType) ? pledgeType : 'none'
  let value: number | null = null
  if (type !== 'none') {
    value = Number(pledgeValue)
    if (!isFinite(value) || value <= 0) return NextResponse.json({ error: 'Enter a valid amount.' }, { status: 400 })
    if (type === 'percent') value = Math.min(100, value)
    value = Math.round(value * 100) / 100
  }

  const { data: p } = await service.from('casting_participants')
    .select('status').eq('casting_id', params.id).eq('user_id', user.id).maybeSingle()
  if (p?.status !== 'confirmed') return NextResponse.json({ error: 'Only confirmed team members can pledge.' }, { status: 403 })

  const { error } = await service.from('casting_participants')
    .update({ pledge_type: type, pledge_value: value })
    .eq('casting_id', params.id).eq('user_id', user.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, pledge_type: type, pledge_value: value })
}
