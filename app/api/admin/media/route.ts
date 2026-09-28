// /api/admin/media — the Media Library (Website Editor → Library, and the picker).
//
// GET    ?view=all|favorites|trash|unused &category=<id>|none &q= &offset= &limit=
//        → { items (each with usedIn), total, categories, imported, purged }
//        Opening the first page also indexes any site photo the library hasn't
//        seen yet and empties Trash items older than 30 days.
// POST   multipart { file, thumb?, width?, height?, category_id?, name? } → new item
// PATCH  { ids, set?: { name, alt, tags, addTags, category_id, favorite }, action?: 'trash'|'restore' }
// DELETE { ids } → delete forever (Trash only; refuses anything still on the site)

import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'crypto'
import { isAdminAuthed } from '@/lib/admin-auth'
import { supabaseAdmin } from '@/lib/supabase'
import { ACCEPT, normalizeTags, SITE_BUCKET } from '@/lib/media-core'
import { collectSiteRefs, usageMap, syncFromSite, deleteForever, purgeOldTrash } from '@/lib/media-library'

export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'
export const maxDuration = 60

const COLS = 'id, url, thumb_url, storage_path, name, alt, tags, category_id, favorite, width, height, bytes, source, deleted_at, created_at'
const MAX_BYTES = 4_400_000   // Vercel's 4.5 MB request ceiling — the browser downsizes before this

// Search text goes into a PostgREST .or() filter STRING, which is not
// parameterised: a comma or parenthesis would re-parse into a different filter.
const cleanQ = (q: string) => q.replace(/[,(){}"'\\%*]/g, ' ').trim().slice(0, 60)

export async function GET(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sb = supabaseAdmin()
  const p = req.nextUrl.searchParams
  const view = p.get('view') || 'all'
  const category = p.get('category') || ''
  const q = cleanQ(p.get('q') || '')
  const offset = Math.max(0, Number(p.get('offset')) || 0)
  const limit = Math.min(120, Math.max(1, Number(p.get('limit')) || 60))

  let usage: Map<string, string[]>
  let imported = 0, purged = 0
  try {
    const refs = await collectSiteRefs(sb)
    usage = usageMap(refs)
    if (offset === 0 && view !== 'trash') imported = await syncFromSite(sb, refs)
    if (offset === 0) purged = await purgeOldTrash(sb, usage)
  } catch (e: any) {
    return NextResponse.json({ error: `Couldn't read the site's photos: ${e?.message || e}` }, { status: 500 })
  }

  let query = sb.from('media').select(COLS, { count: 'exact' })
  query = view === 'trash' ? query.not('deleted_at', 'is', null) : query.is('deleted_at', null)
  if (view === 'favorites') query = query.eq('favorite', true)
  if (category === 'none') query = query.is('category_id', null)
  else if (/^[0-9a-f-]{36}$/i.test(category)) query = query.eq('category_id', category)
  if (q) query = query.or(`name.ilike.%${q}%,alt.ilike.%${q}%,tags.cs.{"${q.toLowerCase()}"}`)

  // "Not used anywhere" is computed, not stored — filter it here, then page by hand.
  let items: any[] = []
  let total = 0
  if (view === 'unused') {
    const { data, error } = await query.order('created_at', { ascending: false }).limit(3000)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    const all = (data ?? []).filter((r: any) => !usage.get(r.url)?.length)
    total = all.length
    items = all.slice(offset, offset + limit)
  } else {
    const { data, error, count } = await query
      .order('favorite', { ascending: false }).order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    items = data ?? []; total = count ?? items.length
  }

  const [{ data: cats }, { data: catIds }] = await Promise.all([
    sb.from('media_categories').select('id, name, sort_order').order('sort_order').order('name'),
    sb.from('media').select('category_id').is('deleted_at', null).limit(10000),
  ])
  const counts = new Map<string, number>()
  for (const r of catIds ?? []) { const k = r.category_id || 'none'; counts.set(k, (counts.get(k) || 0) + 1) }

  return NextResponse.json({
    items: items.map((r: any) => ({ ...r, usedIn: usage.get(r.url) ?? [] })),
    total,
    categories: (cats ?? []).map((c: any) => ({ ...c, count: counts.get(c.id) || 0 })),
    uncategorized: counts.get('none') || 0,
    imported, purged,
  })
}

export async function POST(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  let form: FormData
  try { form = await req.formData() } catch { return NextResponse.json({ error: 'Photo too large or not a form upload.' }, { status: 400 }) }
  const file = form.get('file'), thumb = form.get('thumb')
  if (!(file instanceof File)) return NextResponse.json({ error: 'No photo attached' }, { status: 400 })
  if (!ACCEPT.includes(file.type)) return NextResponse.json({ error: 'Use a JPG, PNG or WebP photo.' }, { status: 400 })
  if (file.size + (thumb instanceof File ? thumb.size : 0) > MAX_BYTES) return NextResponse.json({ error: 'Photo is too large even after resizing — try a smaller original.' }, { status: 413 })

  const sb = supabaseAdmin()
  const id = randomUUID()
  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
  const path = `media/${id}.${ext}`
  const up = await sb.storage.from(SITE_BUCKET).upload(path, Buffer.from(await file.arrayBuffer()), { contentType: file.type, upsert: false })
  if (up.error) return NextResponse.json({ error: up.error.message }, { status: 500 })
  const url = sb.storage.from(SITE_BUCKET).getPublicUrl(path).data.publicUrl

  let thumbUrl: string | null = null
  if (thumb instanceof File && ACCEPT.includes(thumb.type)) {
    const tp = `media/thumbs/${id}.jpg`
    const t = await sb.storage.from(SITE_BUCKET).upload(tp, Buffer.from(await thumb.arrayBuffer()), { contentType: thumb.type, upsert: false })
    if (!t.error) thumbUrl = sb.storage.from(SITE_BUCKET).getPublicUrl(tp).data.publicUrl
  }

  const cat = String(form.get('category_id') || '')
  const num = (k: string) => { const n = Math.round(Number(form.get(k))); return Number.isFinite(n) && n > 0 ? n : null }
  const { data, error } = await sb.from('media').insert({
    url, storage_path: path, thumb_url: thumbUrl,
    name: String(form.get('name') || file.name || 'photo').replace(/\.[a-z0-9]+$/i, '').slice(0, 120),
    category_id: /^[0-9a-f-]{36}$/i.test(cat) ? cat : null,
    width: num('width'), height: num('height'), bytes: file.size, source: 'upload',
  }).select(COLS).single()
  if (error) {
    // Don't leave a file nobody can find.
    await sb.storage.from(SITE_BUCKET).remove([path, `media/thumbs/${id}.jpg`])
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ item: { ...data, usedIn: [] } })
}

export async function PATCH(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const ids: string[] = (Array.isArray(body?.ids) ? body.ids : []).filter((x: any) => /^[0-9a-f-]{36}$/i.test(String(x))).slice(0, 500)
  if (!ids.length) return NextResponse.json({ error: 'No photos selected' }, { status: 400 })
  const sb = supabaseAdmin()
  const now = new Date().toISOString()

  if (body?.action === 'trash' || body?.action === 'restore') {
    const { data, error } = await sb.from('media').update({ deleted_at: body.action === 'trash' ? now : null, updated_at: now }).in('id', ids).select('id')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ updated: data?.length ?? 0 })
  }

  const set = body?.set ?? {}
  const patch: Record<string, unknown> = { updated_at: now }
  if (typeof set.name === 'string') patch.name = set.name.trim().slice(0, 120)
  if (typeof set.alt === 'string') patch.alt = set.alt.trim().slice(0, 300)
  if (set.tags !== undefined) patch.tags = normalizeTags(set.tags)
  if (typeof set.favorite === 'boolean') patch.favorite = set.favorite
  if (set.category_id === null || /^[0-9a-f-]{36}$/i.test(String(set.category_id ?? ''))) {
    if (set.category_id !== undefined) patch.category_id = set.category_id
  }

  if (set.addTags !== undefined) {
    // Adding tags in bulk merges per photo, so each photo keeps its own tags.
    const add = normalizeTags(set.addTags)
    const { data: rows, error } = await sb.from('media').select('id, tags').in('id', ids)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    for (const r of rows ?? []) {
      const { error: e } = await sb.from('media').update({ ...patch, tags: normalizeTags([...(r.tags ?? []), ...add]) }).eq('id', r.id)
      if (e) return NextResponse.json({ error: e.message }, { status: 500 })
    }
    return NextResponse.json({ updated: rows?.length ?? 0 })
  }

  if (Object.keys(patch).length === 1) return NextResponse.json({ error: 'Nothing to change' }, { status: 400 })
  const { data, error } = await sb.from('media').update(patch).in('id', ids).select('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ updated: data?.length ?? 0 })
}

export async function DELETE(req: NextRequest) {
  if (!isAdminAuthed(req)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const ids: string[] = (Array.isArray(body?.ids) ? body.ids : []).filter((x: any) => /^[0-9a-f-]{36}$/i.test(String(x))).slice(0, 200)
  if (!ids.length) return NextResponse.json({ error: 'No photos selected' }, { status: 400 })
  const sb = supabaseAdmin()
  let usage: Map<string, string[]>
  try { usage = usageMap(await collectSiteRefs(sb)) } catch (e: any) {
    return NextResponse.json({ error: `Couldn't check where photos are used, so nothing was deleted: ${e?.message || e}` }, { status: 500 })
  }
  const { data: rows, error } = await sb.from('media').select('id, url, storage_path, thumb_url, deleted_at, name').in('id', ids)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  let deleted = 0
  const blocked: string[] = []
  for (const r of rows ?? []) {
    if (!r.deleted_at) { blocked.push(`${r.name}: move it to Trash first`); continue }
    const res = await deleteForever(sb, r, usage)
    if (res.ok) deleted++; else blocked.push(`${r.name}: ${res.reason}`)
  }
  return NextResponse.json({ deleted, blocked })
}
