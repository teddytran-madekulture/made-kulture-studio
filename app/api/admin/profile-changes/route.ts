// GET /api/admin/profile-changes — recent changes to members' name, phone,
// Instagram (profile_change_log, migration 147) and email (customer_email_changes),
// newest first. Shown on Admin → Directory. 2026-10-07.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isAdminAuthed } from '@/lib/admin-auth'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [logs, emails] = await Promise.all([
    db.from('profile_change_log').select('user_id, field, old_value, new_value, created_at').order('created_at', { ascending: false }).limit(100),
    db.from('customer_email_changes').select('auth_user_id, old_email, new_email, status, changed_by, requested_at').order('requested_at', { ascending: false }).limit(50),
  ])
  if (logs.error || emails.error) {
    return NextResponse.json({ error: logs.error?.message || emails.error?.message }, { status: 500 })
  }

  const rows = [
    ...(logs.data ?? []).map(r => ({ userId: r.user_id, field: r.field, from: r.old_value, to: r.new_value, at: r.created_at, note: null as string | null })),
    ...(emails.data ?? []).map(r => ({ userId: r.auth_user_id, field: 'email', from: r.old_email, to: r.new_email, at: r.requested_at, note: `${r.status}${r.changed_by === 'admin' ? ' · by admin' : ''}` })),
  ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 120)

  const ids = Array.from(new Set(rows.map(r => r.userId).filter(Boolean)))
  const names: Record<string, string> = {}
  if (ids.length) {
    const { data } = await db.from('customer_profiles').select('id, full_name').in('id', ids)
    for (const p of data ?? []) names[p.id] = p.full_name || ''
  }
  return NextResponse.json({ changes: rows.map(r => ({ ...r, name: (r.userId && names[r.userId]) || null })) })
}
