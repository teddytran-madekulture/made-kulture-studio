import type { Metadata } from 'next'
import { SubmissionsView, submissionsMetadata } from '../open-call/[slug]/view'

// /submissions — every open call as a section, plus the always-open Featured
// Editorial. See app/open-call/[slug]/view.tsx.

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function generateMetadata(): Promise<Metadata> {
  return submissionsMetadata()
}

export default function SubmissionsPage() {
  return <SubmissionsView />
}
