import type { MetadataRoute } from 'next'

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || 'https://made-kulture-studio.vercel.app').replace(/\/$/, '')

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/admin', '/api/', '/desk', '/staff', '/kiosk', '/account', '/checkin', '/extend', '/pay', '/short-notice', '/auth'],
    },
    sitemap: `${APP_URL}/sitemap.xml`,
  }
}
