import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { selectAll } from '@/lib/select-all'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// GET /api/admin/traffic?days=30 — Admin → Insights → Traffic (migration 182).
// Aggregated here in JS, like /api/admin/community: the data is small.
// A failed read returns 500, never an empty page that reads as "no visitors".

type Row = { created_at: string; visitor_id: string; session_id: string; user_id: string | null; kind: string; path: string; referrer: string | null; utm_source: string | null; platform: string; device: string | null; country: string | null; city: string | null }

const dayKey = (iso: string) => new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' })

// Where a visit came from, in words Teddy would use.
function source(r: Row): string {
  const u = (r.utm_source || '').toLowerCase()
  if (u) {
    if (/^(ig|insta)/.test(u)) return 'Instagram'
    if (/^(fb|facebook)/.test(u)) return 'Facebook'
    if (/email|newsletter|resend/.test(u)) return 'Email'
    if (/^(sms|text)/.test(u)) return 'Text message'
    return `Link: ${u}`
  }
  const h = (r.referrer || '').toLowerCase()
  if (!h) return 'Direct / unknown'
  if (h.includes('instagram')) return 'Instagram'
  if (h.includes('facebook') || h === 'fb.com' || h.endsWith('.fb.com')) return 'Facebook'
  if (h.includes('tiktok')) return 'TikTok'
  if (h.includes('google')) return 'Google'
  if (h.includes('bing') || h.includes('duckduckgo') || h.includes('yahoo')) return 'Other search'
  if (h.includes('peerspace')) return 'Peerspace'
  if (h.includes('sharegrid')) return 'Sharegrid'
  if (h.includes('mail') || h.includes('outlook')) return 'Email'
  if (h.includes('t.co') || h.includes('twitter') || h === 'x.com') return 'X / Twitter'
  if (h.includes('linktr')) return 'Linktree'
  return h
}

const PAGE_NAMES: Record<string, string> = {
  '/': 'Home', '/sets': 'Sets', '/book': 'Book', '/gear': 'Gear', '/props': 'Props', '/plus': 'Plus',
  '/login': 'Log in', '/signup': 'Sign up', '/account': 'Account', '/faq': 'FAQ', '/tour': 'Tour request',
  '/mini-sessions': 'Mini Sessions', '/drops': 'Set Drops', '/submissions': 'Open Calls', '/nomad': 'Nomad',
}

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get('days')) || 30))
  const since = new Date(Date.now() - days * 86400000).toISOString()

  // Retention: 13 months (stated in migration 182).
  const cutoff = new Date(Date.now() - 396 * 86400000).toISOString()
  const { error: purgeErr } = await db.from('page_views').delete().lt('created_at', cutoff)
  if (purgeErr) console.error('[traffic] purge failed:', purgeErr.message)

  const { data, error } = await selectAll<Row>(() =>
    db.from('page_views').select('created_at, visitor_id, session_id, user_id, kind, path, referrer, utm_source, platform, device, country, city')
      .gte('created_at', since).order('created_at', { ascending: true }))
  if (error) return NextResponse.json({ error: `Could not load traffic: ${error.message}` }, { status: 500 })
  const rows = data ?? []

  const { data: first } = await db.from('page_views').select('created_at').order('created_at', { ascending: true }).limit(1)
  const trackingSince = first?.[0]?.created_at ?? null

  const views = rows.filter(r => r.kind === 'view')
  const booked = rows.filter(r => r.kind === 'booked')
  const visitors = new Set(views.map(r => r.visitor_id))
  const sessions = new Set(views.map(r => r.session_id))
  const members = new Set(views.filter(r => r.user_id).map(r => r.user_id))
  const bookedVisitors = new Set(booked.map(r => r.visitor_id))

  // A visitor's platform = the one they were last seen on.
  const platOf = new Map<string, string>()
  const devOf = new Map<string, string>()
  for (const r of views) { platOf.set(r.visitor_id, r.platform); if (r.device) devOf.set(r.visitor_id, r.device) }
  const countBy = (m: Map<string, string>) => {
    const c: Record<string, number> = {}
    m.forEach(v => { c[v] = (c[v] ?? 0) + 1 })
    return Object.entries(c).map(([k, n]) => ({ key: k, visitors: n })).sort((a, b) => b.visitors - a.visitors)
  }

  // Per day (Houston days), every day in range so quiet days show as zero.
  const perDay = new Map<string, { visitors: Set<string>; views: number; bookings: number }>()
  for (let i = days - 1; i >= 0; i--) perDay.set(dayKey(new Date(Date.now() - i * 86400000).toISOString()), { visitors: new Set(), views: 0, bookings: 0 })
  for (const r of rows) {
    const d = perDay.get(dayKey(r.created_at)); if (!d) continue
    if (r.kind === 'view') { d.views++; d.visitors.add(r.visitor_id) } else d.bookings++
  }

  // Top pages.
  const pages = new Map<string, { views: number; visitors: Set<string> }>()
  for (const r of views) {
    const p = pages.get(r.path) ?? { views: 0, visitors: new Set<string>() }
    p.views++; p.visitors.add(r.visitor_id); pages.set(r.path, p)
  }
  const label = (p: string) => PAGE_NAMES[p] ?? (p.startsWith('/sets/') ? `Set: ${p.slice(6)}` : p.startsWith('/account/directory') ? 'Directory' : p)

  // Sources — one per visit, from its first view; booked = that visit booked.
  const visitSource = new Map<string, string>()
  for (const r of views) if (!visitSource.has(r.session_id)) visitSource.set(r.session_id, source(r))
  const bookedSessions = new Set(booked.map(r => r.session_id))
  const src = new Map<string, { visits: number; visitors: Set<string>; bookings: number }>()
  const sessVisitor = new Map<string, string>()
  for (const r of views) sessVisitor.set(r.session_id, r.visitor_id)
  visitSource.forEach((s, sid) => {
    const e = src.get(s) ?? { visits: 0, visitors: new Set<string>(), bookings: 0 }
    e.visits++; e.visitors.add(sessVisitor.get(sid)!); if (bookedSessions.has(sid)) e.bookings++
    src.set(s, e)
  })

  // Cities (Houston-area traffic vs everyone else).
  const cityOf = new Map<string, string>()
  for (const r of views) if (r.city) cityOf.set(r.visitor_id, r.country && r.country !== 'US' ? `${r.city}, ${r.country}` : r.city)

  const pagesPerVisit = sessions.size ? Math.round((views.length / sessions.size) * 10) / 10 : 0

  return NextResponse.json({
    days, trackingSince,
    summary: {
      visitors: visitors.size, visits: sessions.size, pageViews: views.length, pagesPerVisit,
      members: members.size, bookings: booked.length, bookedVisitors: bookedVisitors.size,
      appVisitors: [...platOf.values()].filter(p => p !== 'web').length,
    },
    perDay: [...perDay.entries()].map(([day, d]) => ({ day, visitors: d.visitors.size, views: d.views, bookings: d.bookings })),
    pages: [...pages.entries()].map(([path, p]) => ({ path, label: label(path), views: p.views, visitors: p.visitors.size }))
      .sort((a, b) => b.views - a.views).slice(0, 25),
    sources: [...src.entries()].map(([name, s]) => ({ name, visits: s.visits, visitors: s.visitors.size, bookings: s.bookings }))
      .sort((a, b) => b.visits - a.visits).slice(0, 15),
    platforms: countBy(platOf),
    devices: countBy(devOf),
    cities: countBy(cityOf).slice(0, 10),
  })
}
