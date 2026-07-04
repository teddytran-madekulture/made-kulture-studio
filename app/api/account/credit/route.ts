import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getCreditBalance, getCreditHistory } from '@/lib/credits'

export const dynamic = 'force-dynamic'

// GET /api/account/credit — the signed-in user's store-credit balance + history.
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [balanceCents, history] = await Promise.all([
    getCreditBalance(user.id),
    getCreditHistory(user.id),
  ])
  return NextResponse.json({ balanceCents, history })
}
