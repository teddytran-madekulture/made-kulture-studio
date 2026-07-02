import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const service = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

// GET /api/admin/portfolio — every member portfolio image, newest first, with
// the member's name attached. Used by the admin content-moderation page.
export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data: imgs, error } = await service
    .from('portfolio_images')
    .select('id, user_id, url, is_mature, hidden, created_at')
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const ids = [...new Set((imgs ?? []).map(i => i.user_id))]
  const names: Record<string, string> = {}
  if (ids.length) {
    const { data: profs } = await service
      .from('customer_profiles').select('id, full_name').in('id', ids)
    for (const p of profs ?? []) names[p.id] = p.full_name ?? ''
  }

  const images = (imgs ?? []).map(i => ({
    id: i.id,
    user_id: i.user_id,
    member: names[i.user_id] || '(unknown)',
    url: i.url,
    is_mature: i.is_mature,
    hidden: i.hidden,
    created_at: i.created_at,
  }))
  return NextResponse.json({ images })
}

// PATCH /api/admin/portfolio — { id, hidden } — archive (hide) or restore an image.
export async function PATCH(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id, hidden } = await req.json().catch(() => ({}))
  if (!id || typeof hidden !== 'boolean') {
    return NextResponse.json({ error: 'id and hidden (boolean) are required' }, { status: 400 })
  }
  const { error } = await service.from('portfolio_images').update({ hidden }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/admin/portfolio — { id } — permanently remove an image (row + file).
export async function DELETE(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const { data: img } = await service
    .from('portfolio_images').select('url').eq('id', id).maybeSingle()

  const { error } = await service.from('portfolio_images').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Best-effort storage cleanup.
  const path = img?.url?.split('/portfolios/')[1]?.split('?')[0]
  if (path) await service.storage.from('portfolios').remove([path]).catch(() => {})

  return NextResponse.json({ ok: true })
}
