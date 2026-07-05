import StudioRulesClient from './StudioRulesClient'
import { getPageContent } from '@/lib/site-content'

// Server wrapper: fetch editable copy (Website workspace) and render the
// client page. No-store so edits go live immediately.
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export default async function StudioRulesPage() {
  const content = await getPageContent('studio-rules')
  return <StudioRulesClient content={content} />
}
