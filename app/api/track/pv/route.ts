import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'
import { isAdminAuthed } from '@/lib/admin-auth'
import { maskPath } from '@/lib/pageview-path'

export const dynamic = 'force-dynamic'

// POST /api/track/pv — batched page views from lib/pageviews.ts (migration 182).
// Body: { vid, sid, platform, views: [{ path, kind, ref?, utm? }] }.
// Anonymous visitors count (that's the point); signed-in members get user_id.
//
// Like /api/track, this ALWAYS answers 204 and never throws at the client.
// Dropped on purpose: bots/crawlers, and anyone holding the admin cookie, so
// the owner checking his own site doesn't inflate the numbers.

const service = createService(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
const BOT = /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|whatsapp|telegram|discord|headless|lighthouse|pingdom|uptime|curl|wget|python|axios|node-fetch|vercel/i
const ID = /^[A-Za-z0-9-]{8,64}$/
const MAX_VIEWS = 30

function device(ua: string): string {
  if (/ipad|tablet|(android(?!.*mobile))/i.test(ua)) return 'tablet'
  if (/mobi|iphone|android/i.test(ua)) return 'mobile'
  return 'desktop'
}
const clip = (v: unknown, n: number) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : null)

export async function POST(req: NextRequest) {
  const done = new NextResponse(null, { status: 204 })
  try {
    const ua = req.headers.get('user-agent') || ''
    if (!ua || BOT.test(ua)) return done
    if (isAdminAuthed(req)) return done

    const body = await req.json().catch(() => null) as { vid?: unknown; sid?: unknown; platform?: unknown; views?: unknown[] } | null
    const vid = typeof body?.vid === 'string' && ID.test(body.vid) ? body.vid : null
    const sid = typeof body?.sid === 'string' && ID.test(body.sid) ? body.sid : null
    if (!vid || !sid || !Array.isArray(body?.views)) return done
    const platform = body!.platform === 'ios' || body!.platform === 'android' ? body!.platform : 'web'

    let userId: string | null = null
    try { userId = (await createClient().auth.getUser()).data.user?.id ?? null } catch {}

    const country = clip(req.headers.get('x-vercel-ip-country'), 4)
    let city: string | null = null
    try { city = clip(decodeURIComponent(req.headers.get('x-vercel-ip-city') || ''), 60) } catch {}
    const dev = device(ua)

    const rows = []
    for (const raw of body!.views.slice(0, MAX_VIEWS)) {
      const v = raw as { path?: unknown; kind?: unknown; ref?: unknown; utm?: unknown }
      if (typeof v?.path !== 'string' || !v.path.startsWith('/')) continue
      rows.push({
        visitor_id: vid, session_id: sid, user_id: userId,
        kind: v.kind === 'booked' ? 'booked' : 'view',
        path: maskPath(v.path),
        referrer: clip(v.ref, 80)?.toLowerCase().replace(/[^a-z0-9.-]/g, '') || null,
        utm_source: clip(v.utm, 40)?.toLowerCase() ?? null,
        platform, device: dev, country, city,
      })
    }
    if (rows.length) {
      const { error } = await service.from('page_views').insert(rows)
      if (error) console.error('[track/pv] insert failed:', error.message)
    }
  } catch (err) {
    console.error('[track/pv] failed:', err)
  }
  return done
}
