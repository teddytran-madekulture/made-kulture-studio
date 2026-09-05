import type { Metadata } from 'next'
import ConceptReviewClient from './ConceptReviewClient'

export const metadata: Metadata = {
  title: 'Concept Review',
  // NOT linked from site nav, and deliberately not indexed. This page is sent to
  // a guest who has already been told no and asked again — a discoverable form
  // would be an invitation and would create more work, not less.
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

export default function ConceptReviewPage() {
  return <ConceptReviewClient />
}
