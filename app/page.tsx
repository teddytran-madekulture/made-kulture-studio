import HomeClient from './HomeClient'
import { getSiteImages, getSiteImageFocals } from '@/lib/site-images'
import { getSiteSettings } from '@/lib/site-settings'
import { getPageContent } from '@/lib/site-content'
import { getActiveHeroSlides } from '@/lib/hero-slides-server'
import { getFeaturedEditorial } from '@/lib/featured-editorial-server'
import { liveEditorial } from '@/lib/featured-editorial'

// Always render with the latest uploaded home-page images + settings so edits
// made in /admin/homepage go live immediately (no redeploy). fetchCache override
// forces the Supabase read to bypass Next.js's Data Cache (else a stale empty
// read is served and uploaded photos / tuned settings don't appear).
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

export default async function Home() {
  const [images, focals, settings, content, hero, editorial] = await Promise.all([getSiteImages(), getSiteImageFocals(), getSiteSettings(), getPageContent('home'), getActiveHeroSlides(), getFeaturedEditorial()])
  return <HomeClient images={images} focals={focals} settings={settings} content={content} heroSlides={hero.slides} heroIntervalSec={hero.intervalSec} editorial={liveEditorial(editorial)} />
}
