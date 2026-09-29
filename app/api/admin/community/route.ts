import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

// GET /api/admin/community?days=30 — Admin → Community.
// Two sources, deliberately:
//  • community_events (migration 119) — what members LOOK at: searches, filters,
//    profile views, portfolio opens, contact clicks, casting views.
//  • the real tables — what members DO: messages, follows, castings, participants.
//    Message BODIES are never selected; only who/when.
// Aggregation happens here in JS: the data is small (a studio community), and
// one route beats a pile of SQL views that each need a migration.

type Ev = { user_id: string; type: string; target_id: string | null; query: string | null; meta: Record<string, unknown> | null; created_at: string }

const dayKey = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Chicago' }) // YYYY-MM-DD, Houston days

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const days = Math.min(365, Math.max(1, Number(req.nextUrl.searchParams.get('days')) || 30))
  const since = new Date(Date.now() - days * 86400000).toISOString()

  // Retention: events older than 12 months are deleted (stated in migration 119).
  const cutoff = new Date(Date.now() - 365 * 86400000).toISOString()
  const { error: purgeErr } = await db.from('community_events').delete().lt('created_at', cutoff)
  if (purgeErr) console.error('[community] purge failed:', purgeErr.message)

  const [evR, profR, msgR, convR, folR, castR, partR] = await Promise.all([
    db.from('community_events').select('user_id, type, target_id, query, meta, created_at').gte('created_at', since).order('created_at', { ascending: true }).limit(50000),
    db.from('customer_profiles').select('id, full_name, roles, avatar_url, directory_opt_in, account_type'),
    db.from('messages').select('conversation_id, sender_id, created_at').gte('created_at', since).limit(50000),
    db.from('conversations').select('id, user_a, user_b, created_at').gte('created_at', since),
    db.from('follows').select('follower_id, following_id, created_at').gte('created_at', since),
    db.from('castings').select('id, title, author_id, status, compensation_type, created_at'),
    db.from('casting_participants').select('casting_id, user_id, status, created_at'),
  ])
  // A failed read must NOT render as "no activity" — surface it.
  const failed = [['events', evR], ['profiles', profR], ['messages', msgR], ['conversations', convR], ['follows', folR], ['castings', castR], ['participants', partR]]
    .filter(([, r]) => (r as { error: unknown }).error)
    .map(([n, r]) => `${n}: ${((r as { error: { message: string } }).error).message}`)
  if (failed.length) return NextResponse.json({ error: `Could not load: ${failed.join('; ')}` }, { status: 500 })

  const events = (evR.data ?? []) as Ev[]
  const profiles = profR.data ?? []
  const nameOf = new Map(profiles.map(p => [p.id, p.full_name || 'Unnamed']))
  const avatarOf = new Map(profiles.map(p => [p.id, p.avatar_url as string | null]))
  const listed = profiles.filter(p => p.directory_opt_in && p.account_type !== 'customer')

  const byType = (t: string) => events.filter(e => e.type === t)
  const metaStr = (e: Ev, k: string) => (e.meta && typeof e.meta[k] === 'string' ? (e.meta[k] as string) : '')
  const metaNum = (e: Ev, k: string) => (e.meta && typeof e.meta[k] === 'number' ? (e.meta[k] as number) : null)

  // ── Searches ──────────────────────────────────────────────────────────────
  const searches = byType('search')
  const searchAgg = new Map<string, { query: string; kind: string; count: number; users: Set<string>; zero: number; lastResults: number | null }>()
  for (const e of searches) {
    const kind = metaStr(e, 'kind') || 'people'
    const label = e.query || [metaStr(e, 'role'), metaStr(e, 'comp')].filter(Boolean).join(' · ') || '(filters only)'
    const key = `${kind}|${label}`
    const r = metaNum(e, 'results')
    const a = searchAgg.get(key) ?? { query: label, kind, count: 0, users: new Set<string>(), zero: 0, lastResults: null }
    a.count++; a.users.add(e.user_id); if (r === 0) a.zero++; a.lastResults = r
    searchAgg.set(key, a)
  }
  const searchRows = Array.from(searchAgg.values()).map(a => ({ query: a.query, kind: a.kind, count: a.count, people: a.users.size, zero: a.zero, lastResults: a.lastResults }))
  const topSearches = [...searchRows].sort((a, b) => b.count - a.count).slice(0, 30)
  const zeroSearches = searchRows.filter(s => s.zero > 0).sort((a, b) => b.zero - a.zero).slice(0, 30)

  // ── Role demand (filters) vs supply (who is listed with that role) ─────────
  const demand = new Map<string, number>()
  for (const e of byType('filter')) { const r = metaStr(e, 'role'); if (r) demand.set(r, (demand.get(r) ?? 0) + 1) }
  for (const e of searches) if (metaStr(e, 'kind') === 'casting' && metaStr(e, 'role')) { const r = metaStr(e, 'role'); demand.set(r, (demand.get(r) ?? 0) + 1) }
  const supply = new Map<string, number>()
  for (const p of listed) for (const r of (p.roles ?? []) as string[]) supply.set(r, (supply.get(r) ?? 0) + 1)
  const roles = Array.from(new Set(Array.from(demand.keys()).concat(Array.from(supply.keys()))))
    .map(r => ({ role: r, filters: demand.get(r) ?? 0, listed: supply.get(r) ?? 0 }))
    .sort((a, b) => b.filters - a.filters || b.listed - a.listed)

  // ── Profiles: views → scrolled to portfolio → opened photos → contact ─────
  type P = { id: string; views: number; viewers: Set<string>; seen: Set<string>; opens: number; deepest: number; contacts: number; messages: number; follows: number }
  const prof = new Map<string, P>()
  const P0 = (id: string) => { let p = prof.get(id); if (!p) { p = { id, views: 0, viewers: new Set(), seen: new Set(), opens: 0, deepest: 0, contacts: 0, messages: 0, follows: 0 }; prof.set(id, p) } return p }
  const contactWhat = new Map<string, number>()
  for (const e of events) {
    if (!e.target_id) continue
    if (e.type === 'profile_view') { const p = P0(e.target_id); p.views++; p.viewers.add(e.user_id) }
    else if (e.type === 'portfolio_seen') P0(e.target_id).seen.add(e.user_id)
    else if (e.type === 'portfolio_open') { const p = P0(e.target_id); p.opens++; p.deepest = Math.max(p.deepest, metaNum(e, 'index') ?? 0) }
    else if (e.type === 'contact_click' && metaStr(e, 'from') !== 'casting') {
      const what = metaStr(e, 'what') || 'other'
      contactWhat.set(what, (contactWhat.get(what) ?? 0) + 1)
      const p = P0(e.target_id)
      if (what !== 'unfollow') p.contacts++
      if (what === 'message') p.messages++
      if (what === 'follow') p.follows++
    }
  }
  const profileRows = Array.from(prof.values())
    .filter(p => p.views > 0)
    .map(p => ({ id: p.id, name: nameOf.get(p.id) ?? 'Unknown', avatar: avatarOf.get(p.id) ?? null, views: p.views, viewers: p.viewers.size, sawPortfolio: p.seen.size, photoOpens: p.opens, deepestPhoto: p.deepest, contacts: p.contacts, messages: p.messages, follows: p.follows }))
    .sort((a, b) => b.viewers - a.viewers || b.views - a.views)
    .slice(0, 40)

  // ── Messaging (real table) ────────────────────────────────────────────────
  const msgs = msgR.data ?? []
  const convs = convR.data ?? []
  const sendersByConv = new Map<string, Set<string>>()
  for (const m of msgs) { const s = sendersByConv.get(m.conversation_id) ?? new Set<string>(); s.add(m.sender_id); sendersByConv.set(m.conversation_id, s) }
  const newConvs = convs.length
  const replied = convs.filter(c => (sendersByConv.get(c.id)?.size ?? 0) >= 2).length

  // ── Castings (real tables) + views/apply clicks (events) ──────────────────
  const castings = castR.data ?? []
  const parts = partR.data ?? []
  const castView = new Map<string, Set<string>>(); const castApply = new Map<string, number>()
  for (const e of byType('casting_view')) if (e.target_id) { const s = castView.get(e.target_id) ?? new Set<string>(); s.add(e.user_id); castView.set(e.target_id, s) }
  for (const e of byType('casting_apply')) if (e.target_id) castApply.set(e.target_id, (castApply.get(e.target_id) ?? 0) + 1)
  const castingRows = castings
    .filter(c => c.created_at >= since || castView.has(c.id) || parts.some(p => p.casting_id === c.id && p.created_at >= since))
    .map(c => {
      const ps = parts.filter(p => p.casting_id === c.id)
      return { id: c.id, title: c.title, author: nameOf.get(c.author_id) ?? 'Unknown', status: c.status, comp: c.compensation_type, posted: c.created_at,
        viewers: castView.get(c.id)?.size ?? 0, applyClicks: castApply.get(c.id) ?? 0,
        interested: ps.filter(p => p.status === 'interested').length, confirmed: ps.filter(p => p.status === 'confirmed').length }
    })
    .sort((a, b) => b.viewers - a.viewers || b.posted.localeCompare(a.posted))

  // ── Activity over time (Houston days) ─────────────────────────────────────
  const daily = new Map<string, { events: number; users: Set<string>; messages: number }>()
  const D = (k: string) => { let d = daily.get(k); if (!d) { d = { events: 0, users: new Set(), messages: 0 }; daily.set(k, d) } return d }
  for (const e of events) { const d = D(dayKey(e.created_at)); d.events++; d.users.add(e.user_id) }
  for (const m of msgs) { const d = D(dayKey(m.created_at)); d.messages++; d.users.add(m.sender_id) }
  const activity = Array.from(daily.entries()).sort(([a], [b]) => a.localeCompare(b))
    .map(([day, d]) => ({ day, activeMembers: d.users.size, events: d.events, messages: d.messages }))

  const activeMembers = new Set<string>([...events.map(e => e.user_id), ...msgs.map(m => m.sender_id)])
  const views = byType('profile_view')
  const viewedAndSaw = new Set(byType('portfolio_seen').map(e => `${e.user_id}|${e.target_id}`))
  const viewPairs = new Set(views.map(e => `${e.user_id}|${e.target_id}`))
  const msgClickPairs = new Set(events.filter(e => e.type === 'contact_click' && metaStr(e, 'what') === 'message').map(e => `${e.user_id}|${e.target_id}`))

  return NextResponse.json({
    days,
    trackingSince: events[0]?.created_at ?? null,
    summary: {
      activeMembers: activeMembers.size,
      listedCreatives: listed.length,
      searches: searches.length,
      profileViews: views.length,
      portfolioOpens: byType('portfolio_open').length,
      messagesSent: msgs.length,
      newConversations: newConvs,
      repliedConversations: replied,
      newFollows: (folR.data ?? []).length,
      castingsPosted: castings.filter(c => c.created_at >= since).length,
      castingApplications: parts.filter(p => p.created_at >= since).length,
      castingConfirmed: parts.filter(p => p.created_at >= since && p.status === 'confirmed').length,
    },
    // Of the (viewer, profile) pairs in the window: how many scrolled to the
    // portfolio, and how many hit Message.
    funnel: { profilePairs: viewPairs.size, sawPortfolio: Array.from(viewPairs).filter(k => viewedAndSaw.has(k)).length, messaged: Array.from(viewPairs).filter(k => msgClickPairs.has(k)).length },
    contactBreakdown: Array.from(contactWhat.entries()).map(([what, count]) => ({ what, count })).sort((a, b) => b.count - a.count),
    topSearches, zeroSearches, roles, profiles: profileRows, castings: castingRows, activity,
  })
}
