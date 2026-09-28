// Media Library — server side. Two jobs nobody else can do:
//
//  1. syncFromSite(): index every photo the site already uses (set photos and
//     galleries, home-page slots, props, hero banners) so the library is never
//     "missing" a photo that's clearly on the website. Idempotent on `url`, and
//     it never re-adds something that's in Trash. Runs every time the library
//     opens, which is why no upload route anywhere else had to change.
//  2. usageMap(): for every URL, where it appears on the site right now. This is
//     what makes delete safe — computed from the live tables at read time, so it
//     can't drift from reality the way a stored "used_in" column would.
//
// ⚠️ A photo's URL must be matched EXACTLY. Every source below stores the same
// public URL string the library row holds, so a plain string compare is right.

import { nameFromUrl, storagePathFromUrl, TRASH_DAYS, SITE_BUCKET } from './media-core'
import { parseStored as parseHeroSlides } from './hero-slides'

type Ref = { url: string; label: string; category: string; name: string; source: string; tags: string[] }

const HOME_SLOT_LABEL: Record<string, string> = { hero: 'Home hero' }

/** Every photo reference on the site, with a human label for "used in". */
export async function collectSiteRefs(sb: any): Promise<Ref[]> {
  const refs: Ref[] = []
  const [sets, slots, props, hero] = await Promise.all([
    sb.from('sets').select('name, slug, photo_url, gallery'),
    sb.from('site_images').select('slug, url, original_url'),
    sb.from('props').select('name, slug, category, image_url, gallery, is_active'),
    sb.from('site_settings').select('value').eq('key', 'hero_slides').maybeSingle(),
  ])
  // A failed read must fail the whole thing — "no references" would make every
  // photo look unused, and unused photos are the ones delete-forever removes.
  for (const r of [sets, slots, props, hero]) if (r.error) throw new Error(`media refs: ${r.error.message}`)

  for (const s of sets.data ?? []) {
    const setName = s.name || s.slug || 'Set'
    if (s.photo_url) refs.push({ url: s.photo_url, label: `${setName} — main photo`, category: setName, name: `${setName} main`, source: 'set', tags: ['set'] })
    ;(Array.isArray(s.gallery) ? s.gallery : []).forEach((u: string, i: number) => {
      if (u && !/\.(mp4|mov|webm)(\?|$)/i.test(u)) refs.push({ url: u, label: `${setName} — gallery`, category: setName, name: `${setName} ${i + 1}`, source: 'set', tags: ['set'] })
    })
  }
  for (const r of slots.data ?? []) {
    const lbl = HOME_SLOT_LABEL[r.slug] || `Home page — ${String(r.slug).replace(/-/g, ' ')}`
    if (r.url) refs.push({ url: r.url, label: lbl, category: 'Home page', name: lbl, source: 'site-slot', tags: ['home'] })
    if (r.original_url && r.original_url !== r.url) refs.push({ url: r.original_url, label: `${lbl} (original)`, category: 'Home page', name: `${lbl} original`, source: 'site-slot', tags: ['home'] })
  }
  for (const p of props.data ?? []) {
    const nm = p.name || p.slug || 'Prop'
    const cat = String(p.category || '').toLowerCase()
    const tag = ['prop', ...(cat ? [cat] : [])]
    const suffix = p.is_active ? '' : ' (hidden)'
    if (p.image_url) refs.push({ url: p.image_url, label: `Prop: ${nm}${suffix}`, category: 'Props', name: nm, source: 'prop', tags: tag })
    ;(Array.isArray(p.gallery) ? p.gallery : []).forEach((u: string, i: number) => {
      if (u && u !== p.image_url) refs.push({ url: u, label: `Prop: ${nm}${suffix}`, category: 'Props', name: `${nm} ${i + 1}`, source: 'prop', tags: tag })
    })
  }
  parseHeroSlides(hero.data?.value).slides.forEach((s, i) => {
    if (s.imageUrl) refs.push({ url: s.imageUrl, label: `Hero banner ${i + 2}${s.enabled ? '' : ' (off)'}`, category: 'Hero banners', name: s.headline.replace(/\n/g, ' ') || `Banner ${i + 2}`, source: 'hero-crop', tags: ['banner'] })
  })
  return refs
}

export function usageMap(refs: Ref[]): Map<string, string[]> {
  const m = new Map<string, string[]>()
  for (const r of refs) {
    const list = m.get(r.url) ?? []
    if (!list.includes(r.label)) list.push(r.label)
    m.set(r.url, list)
  }
  return m
}

/** Find a category id by name, creating it if needed. */
export async function ensureCategory(sb: any, name: string, cache: Map<string, string>): Promise<string | null> {
  const key = name.trim().toLowerCase()
  if (cache.has(key)) return cache.get(key)!
  const { data: ins, error } = await sb.from('media_categories').insert({ name: name.trim() }).select('id').single()
  if (!error && ins) { cache.set(key, ins.id); return ins.id }
  // Lost a race with another insert — read it back.
  const { data: all } = await sb.from('media_categories').select('id, name')
  for (const c of all ?? []) cache.set(String(c.name).trim().toLowerCase(), c.id)
  return cache.get(key) ?? null
}

/** Index site photos the library doesn't know yet. Returns how many were added. */
export async function syncFromSite(sb: any, refs: Ref[]): Promise<number> {
  const known = new Set<string>()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb.from('media').select('url').range(from, from + 999)
    if (error) throw new Error(`media read: ${error.message}`)
    for (const r of data ?? []) known.add(r.url)
    if (!data || data.length < 1000) break
  }
  const fresh = new Map<string, Ref>()
  for (const r of refs) if (!known.has(r.url) && !fresh.has(r.url)) fresh.set(r.url, r)
  if (!fresh.size) return 0

  const cats = new Map<string, string>()
  const { data: allCats } = await sb.from('media_categories').select('id, name')
  for (const c of allCats ?? []) cats.set(String(c.name).trim().toLowerCase(), c.id)

  const rows: any[] = []
  for (const r of Array.from(fresh.values())) {
    rows.push({
      url: r.url,
      storage_path: storagePathFromUrl(r.url),
      name: r.name || nameFromUrl(r.url),
      tags: r.tags,
      category_id: await ensureCategory(sb, r.category, cats),
      source: r.source,
    })
  }
  let added = 0
  for (let i = 0; i < rows.length; i += 200) {
    const { data, error } = await sb.from('media').upsert(rows.slice(i, i + 200), { onConflict: 'url', ignoreDuplicates: true }).select('id')
    if (error) throw new Error(`media import: ${error.message}`)
    added += data?.length ?? 0
  }
  return added
}

/** Remove a library row AND its file — only when we own the file and nothing uses it. */
export async function deleteForever(sb: any, row: { id: string; url: string; storage_path: string | null; thumb_url: string | null }, usage: Map<string, string[]>): Promise<{ ok: boolean; reason?: string }> {
  const used = usage.get(row.url)
  if (used?.length) return { ok: false, reason: `Still used on the site: ${used.join(', ')}` }
  const paths: string[] = []
  if (row.storage_path) paths.push(row.storage_path)
  const thumbPath = row.thumb_url ? storagePathFromUrl(row.thumb_url) : null
  if (thumbPath && thumbPath !== row.storage_path) paths.push(thumbPath)
  if (paths.length) {
    const { error } = await sb.storage.from(SITE_BUCKET).remove(paths)
    // Keep the row if the file couldn't go — otherwise it becomes an orphan
    // nobody can see or clean up.
    if (error) return { ok: false, reason: `Storage delete failed: ${error.message}` }
  }
  const { error } = await sb.from('media').delete().eq('id', row.id)
  if (error) return { ok: false, reason: error.message }
  return { ok: true }
}

/** Empty Trash items older than 30 days (bounded per call; runs when the library opens). */
export async function purgeOldTrash(sb: any, usage: Map<string, string[]>): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_DAYS * 86_400_000).toISOString()
  const { data, error } = await sb.from('media').select('id, url, storage_path, thumb_url')
    .not('deleted_at', 'is', null).lt('deleted_at', cutoff).limit(25)
  if (error || !data?.length) return 0
  let n = 0
  for (const row of data) {
    // Something put it back on the site while it sat in Trash — restore instead of deleting.
    if (usage.get(row.url)?.length) { await sb.from('media').update({ deleted_at: null }).eq('id', row.id); continue }
    if ((await deleteForever(sb, row, usage)).ok) n++
  }
  return n
}
