import WebsiteShell from '@/components/WebsiteShell'

// The Website workspace — site design/content lives here, separate from the
// business-ops admin dashboard. WebsiteShell provides its own sidebar; the
// shared AdminShell renders bare for /admin/website/* (see components/AdminShell.tsx).
export default function WebsiteLayout({ children }: { children: React.ReactNode }) {
  return <WebsiteShell>{children}</WebsiteShell>
}
