import type { Metadata } from 'next'
import StudioRulesClient from './StudioRulesClient'
import { getPageContent } from '@/lib/site-content'

export const metadata: Metadata = {
  title: 'Studio Rules & FAQ',
  description: 'Booking policy, guest limits, cancellation, parking, and everything else to know before your session at Made Kulture in Houston.',
}

// Server wrapper: fetch editable copy (Website workspace) and render the
// client page. No-store so edits go live immediately.
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export default async function StudioRulesPage() {
  const content = await getPageContent('studio-rules')
  return <StudioRulesClient content={content} />
}
