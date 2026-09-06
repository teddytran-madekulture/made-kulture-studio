// Admin — notification history (migration 105).
//
// Every owner push is recorded by lib/push.ts, so this is the durable copy of
// anything that was sent whether or not the device deigned to display it.

import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Service role: `notifications` has RLS enabled with zero policies by design, so
// a cookie-scoped client would read nothing and report success. Admin auth here
// is an HMAC cookie, NOT a Supabase session — see user-scoped-write-sweep.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/admin/notifications?limit=&before=
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const limit = Math.min(Number(req.nextUrl.searchParams.get('limit')) || 50, 200)
  const before = req.nextUrl.searchParams.get('before')

  let q = supabase
    .from('notifications')
    .select('id, title, body, url, tag, subscriptions, accepted, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(limit)
  if (before) q = q.lt('created_at', before)

  const { data, error } = await q
  if (error) {
    console.error('[admin notifications] list failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { count, error: cErr } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null)
  if (cErr) console.error('[admin notifications] unread count failed:', cErr)

  return NextResponse.json({ notifications: data ?? [], unread: count ?? 0 })
}

// PATCH /api/admin/notifications { id } | { allRead: true }
export async function PATCH(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, allRead } = await req.json().catch(() => ({}))

  const now = new Date().toISOString()
  // .select() on both: a write blocked by RLS returns NO error and NO rows, so
  // the row count is the only honest evidence anything happened.
  const q = allRead
    ? supabase.from('notifications').update({ read_at: now }).is('read_at', null).select('id')
    : supabase.from('notifications').update({ read_at: now }).eq('id', id).is('read_at', null).select('id')

  if (!allRead && !id) return NextResponse.json({ error: 'id or allRead required' }, { status: 400 })

  const { data, error } = await q
  if (error) {
    console.error('[admin notifications] mark read failed:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true, updated: data?.length ?? 0 })
}
