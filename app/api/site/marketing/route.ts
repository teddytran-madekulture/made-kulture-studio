// GET /api/site/marketing — the ACTIVE announcement bar / pop-up / mobile info bar
// for the public site (see lib/marketing-tools.ts). Public, no auth.
// CDN-cached 60s so every page view doesn't cost a function run (the Vercel CPU
// lesson from the jukebox); an edit shows up within about a minute.
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { parseStored, activeOnly } from '@/lib/marketing-tools'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET() {
  let active = { announcement: null, popup: null, mobileBar: null } as ReturnType<typeof activeOnly>
  try {
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } })
    const { data, error } = await db.from('site_settings').select('value').eq('key', 'marketing_tools').maybeSingle()
    if (error) console.error('[site/marketing] read failed', error)
    else active = activeOnly(parseStored(data?.value))
  } catch (e) { console.error('[site/marketing] error', e) }
  return NextResponse.json(active, { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=300' } })
}
