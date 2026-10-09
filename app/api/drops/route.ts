// Public — the Set Drops worth showing right now (reserving, deciding, early
// access, or open before/during the run). Feeds the "Set Drops" row on /sets.
import { NextResponse } from 'next/server'
import { supabaseAdmin } from '@/lib/supabase'
import { dropPhase, runLabel, depositFor, dollars, type SetDrop } from '@/lib/set-drops'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET() {
  const { data, error } = await supabaseAdmin().from('set_drops').select('*').in('status', ['pre_reserve', 'funded']).order('run_starts', { ascending: true })
  if (error) return NextResponse.json({ drops: [] })
  const drops = ((data ?? []) as SetDrop[])
    .map(d => ({ d, phase: dropPhase(d) }))
    .filter(x => x.phase !== 'ended')
    .map(({ d, phase }) => ({
      slug: d.slug, name: d.name, tagline: d.tagline, hero_url: d.hero_url, phase,
      runLabel: runLabel(d), deposit: `${dollars(depositFor(d, 1))}${d.deposit_mode === 'per_hour' ? '/hr' : ''}`,
    }))
  return NextResponse.json({ drops })
}
