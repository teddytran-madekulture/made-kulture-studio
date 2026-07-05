import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { getContentPage } from '@/lib/site-content'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/admin/site-content?page=home — current overrides { key: value }
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const page = req.nextUrl.searchParams.get('page') || ''
  if (!getContentPage(page)) return NextResponse.json({ error: 'Unknown page' }, { status: 400 })

  const { data, error } = await supabase.from('site_content').select('key, value').eq('page', page)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const overrides: Record<string, string> = {}
  for (const row of data || []) if (row.key && row.value != null) {
    overrides[row.key] = typeof row.value === 'string' ? row.value : String(row.value)
  }
  return NextResponse.json({ overrides })
}

// POST /api/admin/site-content — JSON { page, key, value }. Upserts one field.
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Expected JSON' }, { status: 400 }) }

  const page = getContentPage(String(body.page || ''))
  if (!page) return NextResponse.json({ error: 'Unknown page' }, { status: 400 })
  const key = String(body.key || '')
  if (!page.fields.some(f => f.key === key)) return NextResponse.json({ error: 'Unknown field' }, { status: 400 })
  const value = String(body.value ?? '')

  const { error } = await supabase.from('site_content')
    .upsert({ page: page.slug, key, value, updated_at: new Date().toISOString() }, { onConflict: 'page,key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/admin/site-content?page=home&key=heroHeadline — reset to default
export async function DELETE(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const page = getContentPage(req.nextUrl.searchParams.get('page') || '')
  const key = req.nextUrl.searchParams.get('key') || ''
  if (!page) return NextResponse.json({ error: 'Unknown page' }, { status: 400 })
  if (!page.fields.some(f => f.key === key)) return NextResponse.json({ error: 'Unknown field' }, { status: 400 })

  const { error } = await supabase.from('site_content').delete().eq('page', page.slug).eq('key', key)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
