import type { Metadata } from 'next'
import BookClient from './BookClient'
import { getPageContent } from '@/lib/site-content'

export const metadata: Metadata = {
  title: 'Book a Session',
  description: 'Book a photography or video set at Made Kulture Houston — pick your set, date, and time, add equipment, and pay online.',
}

// Server wrapper: fetch editable copy (Website workspace) and render the
// booking flow. No-store so edits go live immediately.
export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export default async function BookPage() {
  const content = await getPageContent('book')
  return <BookClient content={content} />
}
