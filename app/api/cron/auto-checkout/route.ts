import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { autoCloseStaleShifts } from '@/lib/shifts'
import { payDueRewards, expireRewards } from '@/lib/rewards'
import { sendRewardsExpiryWarningEmail } from '@/lib/email'

export const maxDuration = 120

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/cron/auto-checkout
// Nightly: closes out sessions where the guest checked in but never checked out,
// once their booking ended over an hour ago. Sets checked_out_at to the booking's
// end time so the "space free" status stays accurate without relying on the guest.
export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString() // ended > 1h ago

  const { data: stale } = await supabase
    .from('bookings')
    .select('id, end_time')
    .not('checked_in_at', 'is', null)
    .is('checked_out_at', null)
    .neq('status', 'cancelled')
    .lt('end_time', cutoff)

  let swept = 0
  for (const b of stale ?? []) {
    const { error } = await supabase
      .from('bookings')
      .update({ checked_out_at: b.end_time })
      .eq('id', b.id)
    if (!error) swept++
  }

  // Purge castings that lapsed over 90 days ago and were never renewed: remove
  // their mood-board images from storage, then delete the rows (which cascades
  // participants, team messages, and reads).
  const purgeCutoff = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString()
  const { data: dead } = await supabase
    .from('castings').select('id, mood_board').lt('expires_at', purgeCutoff)
  let purged = 0
  for (const c of dead ?? []) {
    const board = Array.isArray(c.mood_board) ? c.mood_board : []
    const paths = board
      .map((x: { url?: string }) => x?.url?.split('/casting-media/')[1]?.split('?')[0])
      .filter(Boolean) as string[]
    if (paths.length) await supabase.storage.from('casting-media').remove(paths).catch(() => {})
    const { error } = await supabase.from('castings').delete().eq('id', c.id)
    if (!error) purged++
  }

  // Close out shifts a worker clocked into but never clocked out of (past their end).
  const shiftsClosed = await autoCloseStaleShifts()

  // Made Kulture Rewards (migration 109). Runs after the checkout sweep above.
  // payDueRewards only touches bookings that LOCKED a rate at booking time, so
  // with rewards_enabled='false' there is nothing to pay. Expiry and its 30-day
  // warning only ever touch reward credit. Both are non-fatal to the rest.
  let rewards: any = null, rewardExpiry: any = null
  try { rewards = await payDueRewards(supabase) } catch (e) { console.error('[auto-checkout] rewards payout error', e) }
  try {
    rewardExpiry = await expireRewards(supabase, (to, cents, expiresOn) => sendRewardsExpiryWarningEmail({ to, cents, expiresOn }))
  } catch (e) { console.error('[auto-checkout] rewards expiry error', e) }

  return NextResponse.json({ success: true, swept, purged, shiftsClosed, rewards, rewardExpiry })
}
