import { createClient } from '@supabase/supabase-js'
import { parseStored, activeSlides, centralToday, HERO_SLIDES_DEFAULTS, type HeroSlide } from './hero-slides'

// Server-side read for the home page: only the slides that should show TODAY
// (Central). The home page is force-dynamic, so a slide scheduled for Oct 1
// appears on the first visit after midnight Houston time — no cron, no deploy.
// Fails SOFT to "no extra slides": the main hero still renders, which is exactly
// today's home page.
export async function getActiveHeroSlides(): Promise<{ slides: HeroSlide[]; intervalSec: number }> {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: { persistSession: false },
        global: { fetch: (input: any, init?: any) => fetch(input, { ...init, cache: 'no-store' }) },
      }
    )
    const { data, error } = await supabase.from('site_settings').select('value').eq('key', 'hero_slides').maybeSingle()
    if (error) { console.error('[hero-slides] read failed:', error.message); return { slides: [], intervalSec: HERO_SLIDES_DEFAULTS.intervalSec } }
    const cfg = parseStored(data?.value)
    return { slides: activeSlides(cfg, centralToday()), intervalSec: cfg.intervalSec }
  } catch (e) {
    console.error('[hero-slides] read error:', e)
    return { slides: [], intervalSec: HERO_SLIDES_DEFAULTS.intervalSec }
  }
}
