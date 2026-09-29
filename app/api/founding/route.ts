import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { claimFoundingSpots, foundingTaken, portfolioMaxFor, FOUNDING_CAP } from '@/lib/founding'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const service = createService(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// GET /api/founding — Founding Creatives status.
//   Anyone:     { cap, taken, left }            (the "63 of 100 left" counter)
//   Signed in:  + { mine, portfolioMax }        and claims a number for the
//               caller if their profile just became complete + listed.
export async function GET() {
  try {
    const { data: { user } } = await createClient().auth.getUser()
    let mine: number | null = null
    if (user) {
      const { data: me, error } = await service.from('customer_profiles')
        .select('id, full_name, roles, bio, instagram, links, account_type, directory_opt_in, founding_number, founding_blocked, created_at')
        .eq('id', user.id).maybeSingle()
      if (error) throw new Error(error.message)
      mine = me?.founding_number ?? null
      if (me && !mine && me.directory_opt_in && !me.founding_blocked) {
        const { count } = await service.from('portfolio_images').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
        const got = await claimFoundingSpots(service, [me], () => (count ?? 0) > 0)
        mine = got.get(user.id) ?? null
      }
    }
    const taken = Math.min(await foundingTaken(service), FOUNDING_CAP)
    return NextResponse.json({
      cap: FOUNDING_CAP, taken, left: FOUNDING_CAP - taken,
      ...(user ? { mine, portfolioMax: portfolioMaxFor(mine) } : {}),
    })
  } catch (err) {
    console.error('[founding] GET failed:', err)
    return NextResponse.json({ error: 'Could not load Founding status.' }, { status: 500 })
  }
}
