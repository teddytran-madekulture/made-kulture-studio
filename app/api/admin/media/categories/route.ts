// /api/admin/media/categories — Library categories (one per photo).
//   POST { name } · PATCH { id, name } or { order: [ids] } · DELETE ?id= (its photos become Uncategorized)
import { NextRequest, NextResponse } from 'next/server'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

const isId = (s: unknown) => /^[0-9a-f-]{36}$/i.test(String(s ?? ''))
const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 60)

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const name = clean((await req.json().catch(() => ({})))?.name)
  if (!name) return NextResponse.json({ error: 'Give the category a name' }, { status: 400 })
  const { data, error } = await supabaseAdmin().from('media_categories').insert({ name }).select('id, name, sort_order').single()
  if (error) return NextResponse.json({ error: /duplicate|unique/i.test(error.message) ? 'A category with that name already exists' : error.message }, { status: 400 })
  return NextResponse.json({ category: data })
}

export async function PATCH(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const sb = supabaseAdmin()
  if (Array.isArray(body?.order)) {
    const ids = body.order.filter(isId).slice(0, 200)
    for (let i = 0; i < ids.length; i++) {
      const { error } = await sb.from('media_categories').update({ sort_order: (i + 1) * 10 }).eq('id', ids[i])
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  }
  const name = clean(body?.name)
  if (!isId(body?.id) || !name) return NextResponse.json({ error: 'id and name required' }, { status: 400 })
  const { data, error } = await sb.from('media_categories').update({ name }).eq('id', body.id).select('id')
  if (error) return NextResponse.json({ error: /duplicate|unique/i.test(error.message) ? 'A category with that name already exists' : error.message }, { status: 400 })
  if (!data?.length) return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const id = req.nextUrl.searchParams.get('id')
  if (!isId(id)) return NextResponse.json({ error: 'id required' }, { status: 400 })
  // FK is ON DELETE SET NULL — the photos stay, they just become Uncategorized.
  const { data, error } = await supabaseAdmin().from('media_categories').delete().eq('id', id!).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data?.length) return NextResponse.json({ error: 'Category not found' }, { status: 404 })
  return NextResponse.json({ ok: true })
}
