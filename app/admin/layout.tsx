import type { Metadata, Viewport } from 'next'
import AdminPwa from '@/components/AdminPwa'
import AdminShell from '@/components/AdminShell'

// PWA metadata scoped to /admin — makes the admin installable ("Add to Home
// Screen") as the Made Kulture task app, landing on June's inbox.
export const metadata: Metadata = {
  title: 'Made Kulture Admin',
  manifest: '/admin-manifest.webmanifest',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'MK Admin',
  },
  icons: {
    apple: '/icons/admin-192.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#080808',
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminShell>{children}</AdminShell>
      <AdminPwa />
    </>
  )
}
