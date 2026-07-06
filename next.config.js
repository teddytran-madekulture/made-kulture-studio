/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    domains: ['vvaftjcjydxdlkojnrfm.supabase.co'],
  },
  typescript: {
    ignoreBuildErrors: true,
  },
  eslint: {
    ignoreDuringBuilds: true,
  },
  // Never let the in-studio kiosk tablet serve a stale HTML document. The JS
  // chunks it references are content-hashed (safe to cache forever), but the
  // document must revalidate so a reload picks up the newest build. Paired with
  // the self-update poller in app/kiosk/page.tsx.
  async headers() {
    return [
      {
        source: '/kiosk',
        headers: [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }],
      },
      {
        source: '/api/version',
        headers: [{ key: 'Cache-Control', value: 'no-store, must-revalidate' }],
      },
    ]
  },
}

module.exports = nextConfig
