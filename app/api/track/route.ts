import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createService } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// POST /api/track — batched community analytics from lib/track.ts.
// Body: { events: [{ type, target_id?, query?, meta? }] } (sent via sendBeacon
// or fetch keepalive). Signed-in members only; anonymous calls are dropped.
//
// Analytics must never hurt the page: this ALWAYS answers 204 and never throws
// back at the client. Failures are logged server-side so they aren't invisible.

const service = createService(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

const TYPES = new Set([
  'search', 'filter', 'profile_view', 'portfolio_seen', 'portfolio_open',
  'contact_click', 'casting_view', 'casting_apply', 'casting_list_view',
])
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const MAX_EVENTS = 25

function cleanMeta(m: unknown): Record<string, string | number | boolean> | null {
  if (!m || typeof m !== 'object' || Array.isArray(m)) return null
  const out: Record<string, string | number | boolean> = {}
  for (const [k, v] of Object.entries(m as Record<string, unknown>).slice(0, 8)) {
    if (typeof v === 'number' && Number.isFinite(v)) out[k.slice(0, 24)] = v
    else if (typeof v === 'boolean') out[k.slice(0, 24)] = v
    else if (typeof v === 'string') out[k.slice(0, 24)] = v.slice(0, 60)
  }
  return Object.keys(out).length ? out : null
}

export async function POST(req: NextRequest) {
  const done = new NextResponse(null, { status: 204 })
  try {
    const { data: { user } } = await createClient().auth.getUser()
    if (!user) return done

    const body = await req.json().catch(() => null) as { events?: unknown[] } | null
    const list = Array.isArray(body?.events) ? body!.events.slice(0, MAX_EVENTS) : []
    const rows = []
    for (const raw of list) {
      const e = raw as { type?: unknown; target_id?: unknown; query?: unknown; meta?: unknown }
      if (typeof e?.type !== 'string' || !TYPES.has(e.type)) continue
      const target = typeof e.target_id === 'string' && UUID.test(e.target_id) ? e.target_id : null
      // Never count someone looking at their own profile.
      if (e.type === 'profile_view' && target === user.id) continue
      const query = typeof e.query === 'string' ? e.query.trim().toLowerCase().slice(0, 80) || null : null
      rows.push({ user_id: user.id, type: e.type, target_id: target, query, meta: cleanMeta(e.meta) })
    }
    if (rows.length) {
      const { error } = await service.from('community_events').insert(rows)
      if (error) console.error('[track] insert failed:', error.message)
    }
  } catch (err) {
    console.error('[track] failed:', err)
  }
  return done
}
