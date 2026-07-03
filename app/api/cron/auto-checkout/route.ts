import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
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

  return NextResponse.json({ success: true, swept, purged })
}
