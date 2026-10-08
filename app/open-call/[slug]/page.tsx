import { redirect } from 'next/navigation'

// Open calls are sections on /submissions now (Teddy, 2026-10-08). Old and
// shared /open-call/<slug> links land on the right section.
export default function OpenCallPage({ params }: { params: { slug: string } }) {
  redirect(`/submissions#${encodeURIComponent(params.slug)}`)
}
