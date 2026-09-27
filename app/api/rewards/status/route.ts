// Public: is Made Kulture Rewards on, and at what rates? (migration 109)
// Drives the checkout sign-in nudge, the Plus comparison and the Terms section,
// so none of them advertise a program that is switched off.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { getRewardSettings } from '@/lib/rewards'

export const dynamic = 'force-dynamic'

export async function GET() {
  const s = await getRewardSettings(supabaseAdmin())
  return NextResponse.json(s, { headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=600' } })
}
