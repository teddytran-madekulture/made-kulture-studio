// GET /api/kiosk/showcase — the editorials in rotation, for the kiosk tablets'
// idle SHOWCASE screen (components/KioskShowcase.tsx), which cycles through
// ALL of them (the website shows one per visit).
//
// Public on purpose: it is exactly what the home page already shows. Returns
// { editorials: [] } when nothing is live, and the tablet stays on its normal
// home screen.
//
// ⚠️ CDN-CACHED FOR 10 MIN (s-maxage). Tablets ask about once an hour; the
// editorials change a few times a month at most. However many tablets there
// are, this collapses to a handful of function runs a day. Do NOT add a
// per-tablet query param — it would split the cache. See vercel-cpu-jukebox-polling.
import { NextResponse } from 'next/server'
import { getLiveEditorials } from '@/lib/featured-editorial-server'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET() {
  const editorials = (await getLiveEditorials()).map(e => ({
    id: e.id, title: e.title, subtitle: e.subtitle, setName: e.setName, setSlug: e.setSlug, postUrl: e.postUrl,
    promoLabel: e.promoLabel, promoUrl: e.promoUrl, promoCta: e.promoCta, promoHeadline: e.promoHeadline, promoText: e.promoText,
    credits: e.credits, photos: e.photos, intervalSec: e.intervalSec,
  }))
  return NextResponse.json({ editorials }, {
    headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' },
  })
}
