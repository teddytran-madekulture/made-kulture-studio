import TourClient from './TourClient'
import { getPageContent } from '@/lib/site-content'

// Server wrapper: fetch editable copy (Website workspace) and render the
// client page. No-store so edits go live immediately.
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export default async function TourPage() {
  const content = await getPageContent('tour')
  return <TourClient content={content} />
}
