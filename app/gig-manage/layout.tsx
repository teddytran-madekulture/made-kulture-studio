import type { Metadata } from 'next'

// A private bearer-link page — never indexed, never previewed with details.
export const metadata: Metadata = {
  title: 'Your gig · Made Kulture',
  robots: { index: false, follow: false },
}

export default function GigManageLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
