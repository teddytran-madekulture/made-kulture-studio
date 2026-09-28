// /api/admin/marketing-tools — the Website Editor's Marketing Tools page.
//   GET → everything as saved (incl. switched-off pieces and schedules)
//   PUT { announcement, popup, mobileBar } → sanitised, saved, returned
import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { parseStored, sanitize } from '@/lib/marketing-tools'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabaseAdmin().from('site_settings').select('value').eq('key', 'marketing_tools').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ tools: parseStored(data?.value) })
}

export async function PUT(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Expected JSON' }, { status: 400 }) }
  // updatedAt changes on every save: a "show once" pop-up shows again after an edit.
  const tools = sanitize({ ...body, updatedAt: new Date().toISOString() })
  const { data, error } = await supabaseAdmin().from('site_settings')
    .upsert({ key: 'marketing_tools', value: JSON.stringify(tools), updated_at: new Date().toISOString() }, { onConflict: 'key' })
    .select('key')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Not saved (no row written).' }, { status: 500 })
  return NextResponse.json({ tools })
}
