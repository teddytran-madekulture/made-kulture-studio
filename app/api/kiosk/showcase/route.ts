// GET /api/kiosk/showcase — the Featured Editorial for the kiosk tablets'
// idle SHOWCASE screen (components/KioskShowcase.tsx).
//
// Public on purpose: it is exactly what the home page already shows. Returns
// { editorial: null } when nothing is live, and the tablet stays on its
// normal home screen.
//
// ⚠️ CDN-CACHED FOR 10 MIN (s-maxage). Tablets ask about once an hour; the
// editorial changes a few times a year. However many tablets there are, this
// collapses to a handful of function runs a day. Do NOT add a per-tablet query
// param — it would split the cache. See vercel-cpu-jukebox-polling.
import { NextResponse } from 'next/server'
import { getFeaturedEditorial } from '@/lib/featured-editorial-server'
import { liveEditorial } from '@/lib/featured-editorial'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET() {
  const e = liveEditorial(await getFeaturedEditorial())
  const editorial = e ? {
    title: e.title, subtitle: e.subtitle, setName: e.setName, postUrl: e.postUrl,
    credits: e.credits, photos: e.photos, intervalSec: e.intervalSec, updatedAt: e.updatedAt,
  } : null
  return NextResponse.json({ editorial }, {
    headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' },
  })
}
