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
import { supabaseAdmin } from '@/lib/supabase'
import { dropPhase, depositFor, dollars, runLabel, type SetDrop } from '@/lib/set-drops'
import { isVideoUrl } from '@/lib/media-url'

// Live Set Drops ride along as ADS in the idle showcase (QR to the drop page),
// and as a short list for the home-screen pill. Ends by itself: a drop past its
// deadline or run is never returned. A failed lookup just means no drop ads.
const shortDay = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', month: 'short', day: 'numeric' }).format(new Date(iso))
const perks = (d: SetDrop) => {
  const p = [
    d.perk_discount && d.discount_kind === 'percent' && d.discount_value ? `${d.discount_value}% off` : null,
    d.perk_early_access ? 'first pick of dates' : null,
  ].filter(Boolean)
  return p.length ? `, plus ${p.join(' and ')}` : ''
}

async function liveDrops() {
  const { data, error } = await supabaseAdmin().from('set_drops').select('*').in('status', ['pre_reserve', 'funded'])
  if (error) { console.error('[kiosk showcase] drop lookup failed:', error.message); return [] }
  return ((data ?? []) as SetDrop[])
    .map(d => ({ d, phase: dropPhase(d) }))
    .filter(x => x.phase === 'pre_reserve' || x.phase === 'early_access' || x.phase === 'open')
}

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET() {
  const drops = await liveDrops().catch(() => [])
  const dropAds = drops.map(({ d, phase }) => {
    const reserving = phase === 'pre_reserve'
    const photos = [d.hero_url, ...(d.gallery ?? []), ...(d.past_gallery ?? []).map(p => p.url)]
      .filter((u): u is string => !!u && !isVideoUrl(u))
    return {
      id: `drop-${d.slug}`, title: d.name, subtitle: d.tagline ?? '', setName: d.name, setSlug: undefined, postUrl: '',
      // Same words as the home-page hero slide (look "A", Teddy 2026-10-09).
      // Same words as the home-page hero slide (option 1, Teddy 2026-10-09):
      // lead with the VOTE so nobody reads it as "this is happening".
      promoLabel: reserving ? `${d.name.toUpperCase()} · SET DROP` : 'LIMITED RUN · NOW BOOKING',
      promoUrl: reserving ? `/drops/${d.slug}#reserve` : `/drops/${d.slug}`,
      promoCta: reserving ? 'SCAN TO VOTE' : 'SCAN TO BOOK',
      promoHeadline: reserving ? 'VOTE TO\nBRING IT BACK' : d.name,
      promoText: reserving
        ? `${d.name} only returns if ${d.goal_type === 'people' && d.goal_value ? `${d.goal_value} of you` : 'enough of you'} reserve${d.pre_reserve_ends_at ? ` by ${shortDay(d.pre_reserve_ends_at)}` : ''}. Put down ${dollars(depositFor(d, 1))} to vote. If it's built, it becomes studio credit${perks(d)}. If not, you get it back.`
        : `${d.tagline ? d.tagline + ' ' : ''}${runLabel(d)}.`,
      credits: [], photos: Array.from(new Set(photos)).slice(0, 8), intervalSec: 7,
    }
  }).filter(a => a.photos.length)

  const editorials = (await getLiveEditorials()).map(e => ({
    id: e.id, title: e.title, subtitle: e.subtitle, setName: e.setName, setSlug: e.setSlug, postUrl: e.postUrl,
    promoLabel: e.promoLabel, promoUrl: e.promoUrl, promoCta: e.promoCta, promoHeadline: e.promoHeadline, promoText: e.promoText,
    credits: e.credits, photos: e.photos, intervalSec: e.intervalSec,
  }))
  return NextResponse.json({
    editorials: [...dropAds, ...editorials],
    drops: drops.map(({ d, phase }) => ({
      slug: d.slug, name: d.name, phase,
      line: phase === 'pre_reserve'
        ? `Vote to bring it back · ${dollars(depositFor(d, 1))} deposit by ${d.pre_reserve_ends_at ? shortDay(d.pre_reserve_ends_at) : 'the deadline'}`
        : `Now booking · ${runLabel(d)}`,
    })),
  }, {
    headers: { 'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600' },
  })
}
