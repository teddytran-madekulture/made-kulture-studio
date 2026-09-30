import { createClient } from '@supabase/supabase-js'
import { parseStored, type FeaturedEditorial } from './featured-editorial'

// Server-side read for the home page. Bypasses Next's Data Cache so a save in
// the editor shows on the next page load (see site-images.ts / site-settings.ts).
// Any failure returns the switched-off default — the section then shows the
// plain studio photo slot, never an error.
export async function getFeaturedEditorial(): Promise<FeaturedEditorial> {
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
    if (error) return parseStored(null)
    return parseStored(data?.value)
  } catch {
    return parseStored(null)
  }
}
