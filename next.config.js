// Old Squarespace address → new page. Set pages go to the set's own page
// (it has the BOOK button); the per-set Acuity "calender" pages did too.
const SQUARESPACE_REDIRECTS = [
  ['/home', '/'],
  ['/studiorules', '/studio-rules'],
  ['/contact', '/'],
  ['/services', '/sets'],
  ['/set-pricing', '/sets'],
  ['/layout', '/sets'],
  ['/the-yard', '/sets'],
  ['/schedule', '/availability'],
  ['/member-site-homepage-2', '/plus'],
  ['/member-site-homepage-2-1', '/plus'],
  ['/production-booking', '/book?type=studio'],
  ['/entire-studio', '/book?type=studio'],
  // Set landing pages (Squarespace slug → our /sets/<slug>)
  ['/set-a', '/sets/set-a'],
  ['/vintage', '/sets/vintage'],
  ['/concrete', '/sets/concrete'],
  ['/cottage', '/sets/cottage'],
  ['/studio-one', '/sets/studio-one'],
  ['/the-watering-hole', '/sets/watering-hole'],
  // Acuity calendar pages, one per set
  ['/set-a-calender', '/sets/set-a'],
  ['/set-b-calender', '/sets/set-b'],
  ['/set-c-calender', '/sets/set-c'],
  ['/set-d-calender-1', '/sets/set-d'],
  ['/concrete-calender', '/sets/concrete'],
  ['/vintage-calender', '/sets/vintage'],
  ['/cottage-calender', '/sets/cottage'],
  ['/thewateringhole-calender', '/sets/watering-hole'],
  ['/studioone-calender-1', '/sets/studio-one'],
  ['/thetrainer-calender', '/sets'],
  // Prop category pages — the new /props page holds every category
  ['/props/bench', '/props'],
  ['/props/chairs', '/props'],
  ['/props/fitness', '/props'],
  ['/props/misc', '/props'],
  ['/props/sofas', '/props'],
  ['/props/tables', '/props'],
  // Props whose slug changed in the new catalog (matched by name)
  ['/props/p/tassel-mediterranean-ottoman', '/props/p/red-tassel-ottoman'],
  ['/props/p/retro-bicycle', '/props/p/vintage-bicycle'],
  ['/props/p/vintage-eliptical-machine', '/props/p/vintage-eliptical'],
  ['/props/p/adjustable-benchpress', '/props/p/adjustable-gym-bench'],
  ['/props/p/vintage-wheel-chair', '/props/p/vintage-wheelchair'],
  ['/props/p/victorian-high-chair', '/props/p/victorian-tan-highchair'],
  ['/props/p/victorian-beige-pattern-chair', '/props/p/victorian-beige'],
  ['/props/p/purple-recliner', '/props/p/purple-vintage-recliner'],
  ['/props/p/folding-metal-chairs', '/props/p/metal-folding-chairs'],
  ['/props/p/metal-leather-chair', '/props/p/steel-and-brown-leather'],
  ['/props/p/blue-executive-chair', '/props/p/rolling-blue-executive'],
  ['/props/p/red-relaxer-chair', '/props/p/red-relaxer'],
  // Old props with no clear match in the new catalog → the catalog
  ...[
    'lounging-box', 'round-rustic-side-table', 'round-farm-coffee-table', 'mid-century-round-dining-table',
    'kitchen-island-cart', 'wooden-rocking-chair', 'green-slipper-chair', 'hn1v685rn1jkb97dxbo84yf4h3yxnk',
    'gray-recliner', 'class-chair', 'blue-gothic-wood-chair', 'blue-retro-chair',
  ].map(slug => [`/props/p/${slug}`, '/props']),
]

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
  // The nav label reads MEMBERSHIP but the page lives at /plus, so anyone who
  // types or guesses /membership got a 404. Redirect rather than rename: /plus
  // is the URL in emails, the account page and the renewal SMS.
  async redirects() {
    return [
      { source: '/membership',  destination: '/plus', permanent: true },
      { source: '/memberships', destination: '/plus', permanent: true },
      // Old Squarespace/Acuity booking page. It is also the opt-in URL on file
      // with Twilio's toll-free verification, so after the domain move it must
      // land on the booking flow (which shows the SMS consent), never a 404.
      { source: '/bookingselections', destination: '/book', permanent: false },

      // ── Old Squarespace pages (sitemap pulled 2026-09-28) ──────────────────
      // Google, Instagram and old emails point at these. Each lands on its
      // closest new page instead of a 404. Kept NON-permanent until launch has
      // settled — a 308 is cached hard by browsers and hard to take back.
      ...SQUARESPACE_REDIRECTS.map(([source, destination]) => ({ source, destination, permanent: false })),
    ]
  },

  // Never let the in-studio kiosk tablet serve a stale HTML document. The JS
  // chunks it references are content-hashed (safe to cache forever), but the
  // document must revalidate so a reload picks up the newest build. Paired with
  // the self-update poller in app/kiosk/page.tsx.
  async headers() {
    return [
      // The vercel.app address stays live forever (webhooks, jukebox players,
      // links already sent) but must never compete with madekulture.com in
      // Google. Static header — no middleware, no CPU. Pairs with the
      // address-aware `robots` in app/layout.tsx.
      {
        source: '/:path*',
        has: [{ type: 'host', value: '(?<vhost>.*\\.vercel\\.app)' }],
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
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
