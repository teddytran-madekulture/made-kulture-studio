import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getCreditBalance, getCreditHistory } from '@/lib/credits'
import { supabaseAdmin } from '@/lib/supabase'
import { getRewardSettings, rewardRateForEmail, rewardPotForUser } from '@/lib/rewards'
import { standingForEmail, canEarnRewards } from '@/lib/standing'

export const dynamic = 'force-dynamic'

// GET /api/account/credit — the signed-in user's store-credit balance + history,
// plus what they'd earn in Made Kulture Rewards right now (migration 109) so
// checkout can say "You'll earn $X". `rewards.rate` is null when the program is
// off or the account is below good standing.
export async function GET() {
  const supabase = createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = supabaseAdmin()
  const [balanceCents, history, settings, pot, standing] = await Promise.all([
    getCreditBalance(user.id),
    getCreditHistory(user.id),
    getRewardSettings(db),
    rewardPotForUser(db, user.id),
    standingForEmail(db, user.email),
  ])
  const eligible = canEarnRewards(standing)
  const rate = settings.enabled && eligible ? await rewardRateForEmail(db, user.email, settings) : null
  return NextResponse.json({
    balanceCents, history,
    rewards: { enabled: settings.enabled, rate, eligible, rewardCents: pot.rewardCents },
  })
}
