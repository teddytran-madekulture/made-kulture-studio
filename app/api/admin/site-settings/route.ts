import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'
import { SITE_SETTINGS_DEFAULTS, clampHeroHeight } from '@/lib/site-settings'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

// GET /api/admin/site-settings — current settings merged over defaults.
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase.from('site_settings').select('key, value')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const map: Record<string, string> = {}
  for (const row of data || []) if (row.key) map[row.key] = row.value

  const settings = { ...SITE_SETTINGS_DEFAULTS }
  if (map.hero_height_vh != null) settings.heroHeightVh = clampHeroHeight(parseFloat(map.hero_height_vh))
  return NextResponse.json({ settings })
}

// POST /api/admin/site-settings — JSON { heroHeightVh }. Upserts the row.
export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: any
  try { body = await req.json() } catch { return NextResponse.json({ error: 'Expected JSON' }, { status: 400 }) }

  if (body.heroHeightVh == null) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  const value = clampHeroHeight(Number(body.heroHeightVh))

  const { error } = await supabase.from('site_settings')
    .upsert({ key: 'hero_height_vh', value: String(value), updated_at: new Date().toISOString() }, { onConflict: 'key' })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ heroHeightVh: value })
}
