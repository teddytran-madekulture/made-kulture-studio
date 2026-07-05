import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// Settings for the post-session Google-review ask (see /api/cron/review-requests).
// Stored in site_settings: review_url (the Google "write a review" link) and
// review_requests_enabled ('1' | '0').

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase.from('site_settings').select('key, value')
    .in('key', ['review_url', 'review_requests_enabled'])
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const map: Record<string, string> = {}
  for (const row of data || []) if (row.key) map[row.key] = row.value
  return NextResponse.json({
    reviewUrl: map.review_url || '',
    enabled: map.review_requests_enabled === '1',
  })
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Expected JSON' }, { status: 400 }) }

  const rows: { key: string; value: string; updated_at: string }[] = []
  const now = new Date().toISOString()
  if (typeof body.reviewUrl === 'string') {
    const url = body.reviewUrl.trim()
    if (url && !/^https:\/\//i.test(url)) return NextResponse.json({ error: 'Review link must start with https://' }, { status: 400 })
    rows.push({ key: 'review_url', value: url, updated_at: now })
  }
  if (typeof body.enabled === 'boolean') {
    rows.push({ key: 'review_requests_enabled', value: body.enabled ? '1' : '0', updated_at: now })
  }
  if (!rows.length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { error } = await supabase.from('site_settings').upsert(rows, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
