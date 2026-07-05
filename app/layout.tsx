import type { Metadata, Viewport } from 'next'
import './globals.css'
import JuneChatWidget from '@/components/JuneChatWidget'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 5,
}

export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: {
    default: 'Made Kulture — Photography Studio Rental in Houston, TX',
    template: '%s | Made Kulture — Houston Studio Rental',
  },
  description: 'Rent a photography or video studio in Houston. 9 distinct sets under one warehouse — cyc-style walls, vintage, concrete, even a shallow pool. From $40/hr, book online.',
  keywords: ['photography studio rental Houston', 'photo studio Houston', 'video studio rental Houston', 'creative studio Houston', 'studio with pool Houston', 'warehouse studio rental'],
  openGraph: {
    title: 'Made Kulture — Photography Studio Rental in Houston',
    description: 'Create without limits. 9 distinct sets, props and lighting included, from $40/hr. 4825 Gulf Freeway, Houston TX.',
    url: APP_URL,
    siteName: 'Made Kulture',
    locale: 'en_US',
    type: 'website',
  },
}

// LocalBusiness structured data — how Google understands who/where we are.
// Keep in sync with the footer + CLAUDE.md (hours, address, phone).
const LOCAL_BUSINESS_JSONLD = {
  '@context': 'https://schema.org',
  '@type': 'LocalBusiness',
  '@id': `${APP_URL}#business`,
  name: 'Made Kulture',
  description: 'Multi-set creative studio rental for photographers, videographers, brands, and content creators in Houston, TX.',
  url: APP_URL,
  telephone: '+18324081631',
  priceRange: '$40-$400',
  address: {
    '@type': 'PostalAddress',
    streetAddress: '4825 Gulf Freeway',
    addressLocality: 'Houston',
    addressRegion: 'TX',
    postalCode: '77023',
    addressCountry: 'US',
  },
  geo: { '@type': 'GeoCoordinates', latitude: 29.7096, longitude: -95.3245 },
  openingHoursSpecification: {
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
    opens: '09:00',
    closes: '22:00',
  },
  sameAs: ['https://www.instagram.com/madekulture/'],
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(LOCAL_BUSINESS_JSONLD) }}
        />
        {children}
        <JuneChatWidget />
      </body>
    </html>
  )
}
