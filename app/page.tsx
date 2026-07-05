import HomeClient from './HomeClient'
import { getSiteImages } from '@/lib/site-images'

// Always render with the latest uploaded home-page images so edits made in
// /admin/homepage go live immediately (no redeploy).
export const dynamic = 'force-dynamic'

export default async function Home() {
  const images = await getSiteImages()
  return <HomeClient images={images} />
}
