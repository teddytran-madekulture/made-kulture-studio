import SetsClient from './SetsClient'
import { getPageContent } from '@/lib/site-content'

// Server wrapper: fetch editable copy (Website workspace) and render the
// client page. No-store so edits go live immediately.
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export default async function SetsPage() {
  const content = await getPageContent('sets')
  return <SetsClient content={content} />
}
