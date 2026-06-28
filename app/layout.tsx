import type { Metadata, Viewport } from 'next'
import './globals.css'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export const metadata: Metadata = {
  title: 'Made Kulture | Creative Studio — Houston, TX',
  description: 'A multi-set creative studio built for photographers, videographers, brands, and creators. 4825 Gulf Freeway, Houston TX 77023.',
  openGraph: {
    title: 'Made Kulture Studio',
    description: 'Create without limits. A multi-set creative studio in Houston.',
    url: 'https://madekulture.com',
    siteName: 'Made Kulture',
    locale: 'en_US',
    type: 'website',
  },
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
