import HomeClient from './HomeClient'
import { getSiteImages } from '@/lib/site-images'

// Always render with the latest uploaded home-page images so edits made in
// /admin/homepage go live immediately (no redeploy). fetchCache override forces
// the Supabase read to bypass Next.js's Data Cache (else a stale empty read is
// served and uploaded photos don't appear).
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const revalidate = 0

export default async function Home() {
  const images = await getSiteImages()
  return <HomeClient images={images} />
}
