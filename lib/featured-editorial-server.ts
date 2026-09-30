import { createClient } from '@supabase/supabase-js'
import { parseStoredConfig, liveEditorials, centralToday, type FeaturedEditorial } from './featured-editorial'

// Server-side read: the editorials in rotation TODAY (Central). Bypasses Next's
// Data Cache so a save in the editor shows on the next page load. Any failure
// returns [] — the home page then shows the plain studio photo, never an error.
export async function getLiveEditorials(): Promise<FeaturedEditorial[]> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { persistSession: false },
        global: { fetch: (input: any, init?: any) => fetch(input, { ...init, cache: 'no-store' }) },
      }
    )
    const { data, error } = await supabase.from('site_settings').select('value').eq('key', 'featured_editorial').maybeSingle()
    if (error) return []
    return liveEditorials(parseStoredConfig(data?.value), centralToday())
  } catch {
    return []
  }
}

/** One per visit: the home page is force-dynamic, so each request draws again. */
export async function pickEditorialForVisit(): Promise<FeaturedEditorial | null> {
  const live = await getLiveEditorials()
  return live.length ? live[Math.floor(Math.random() * live.length)] : null
}
