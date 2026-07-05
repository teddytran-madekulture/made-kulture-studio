import type { Metadata } from 'next'
import SetsClient from './SetsClient'
import { getPageContent } from '@/lib/site-content'

export const metadata: Metadata = {
  title: 'Sets & Spaces — 9 Photography Sets from $40/hr',
  description: 'Browse all 9 studio sets: white cyc-style walls, red vinyl backdrop, concrete, vintage, cottage, a shallow black pool, and a full warehouse buyout. Book online.',
}

// Server wrapper: fetch editable copy (Website workspace) and render the
// client page. No-store so edits go live immediately.
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export default async function SetsPage() {
  const content = await getPageContent('sets')
  return <SetsClient content={content} />
}
