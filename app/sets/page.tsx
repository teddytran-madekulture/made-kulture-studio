import type { Metadata } from 'next'
import SetsClient from './SetsClient'
import { getPageContent } from '@/lib/site-content'

export const metadata: Metadata = {
  // No set count and no rate in the title on purpose: both live in the DB and are
  // rendered live by SetsClient (sets.length / minRate). Hardcoding them here has
  // gone stale twice — the title said "9 sets from $50" while the page said 10 at $40.
  title: 'Sets & Spaces — Photo & Video Studio Sets in Houston',
  description: 'Browse every Made Kulture studio set: white cinderblock, faux brush, red vinyl backdrop, rose velvet, concrete, vintage, cottage, a shallow black pool, and the full warehouse buyout. Hourly rates, book online.',
}

// Server wrapper: fetch editable copy (Website workspace) and render the
// client page. No-store so edits go live immediately.
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export default async function SetsPage() {
  const content = await getPageContent('sets')
  return <SetsClient content={content} />
}
