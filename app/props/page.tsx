import type { Metadata } from 'next'
import PropsClient from './PropsClient'
import { getPageContent } from '@/lib/site-content'

export const metadata: Metadata = {
  title: 'Studio Props — Included With Every Booking',
  description: 'Browse 180+ props available in-studio: chairs, sofas, tables, benches, and more. All included with your set rental at Made Kulture Houston.',
}

// Server wrapper: fetch editable copy (Website workspace) and render the
// client page. No-store so edits go live immediately.
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export default async function PropsPage() {
  const content = await getPageContent('props')
  return <PropsClient content={content} />
}
