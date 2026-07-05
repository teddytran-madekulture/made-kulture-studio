import { notFound } from 'next/navigation'
import PageEditor from '@/components/PageEditor'
import { getContentPage } from '@/lib/site-content'

// Per-page website editor. The slug must exist in CONTENT_PAGES
// (lib/site-content.ts); the Website sidebar lists one link per page.
export default function EditPage({ params }: { params: { slug: string } }) {
  if (!getContentPage(params.slug)) notFound()
  return <PageEditor slug={params.slug} />
}
