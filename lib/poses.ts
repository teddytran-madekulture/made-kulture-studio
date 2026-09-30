// POSE GUIDE — server side (2026-09-29). See lib/pose-categories.ts for the list.
//
// ⚠️ Guest contributions are 'pending' until the owner approves them in
// /admin/poses. Nothing a guest uploads is ever shown to anyone else first:
// review covers nudity, quality and people who didn't agree to be pictured.
// ⚠️ Stock images (Unsplash; earlier rows may be Pexels) are hotlinked and
// CREDITED ("Photo by X on Unsplash") — a condition of their licence. Never drop it.
import { supabaseAdmin } from '@/lib/supabase'
import { POSE_CATEGORIES } from '@/lib/pose-categories'

export const POSE_BUCKET = 'poses'
const SIGNED_SECONDS = 12 * 60 * 60

export interface PoseOut {
  id: string; category: string; source: string; src: string
  width: number | null; height: number | null
  credit: string | null; setName: string | null
}

const SELECT = 'id, category, source, status, image_url, storage_path, width, height, credit_name, set_slug, created_at'

async function setNames(slugs: string[]) {
  const m = new Map<string, string>()
  const uniq = Array.from(new Set(slugs.filter(Boolean)))
  if (!uniq.length) return m
  const { data } = await supabaseAdmin().from('sets').select('slug, name').in('slug', uniq)
  for (const r of (data ?? []) as any[]) m.set(r.slug, r.name)
  return m
}

/** Rows → display shape, with signed URLs for our own files. */
export async function shapePoses(rows: any[]): Promise<PoseOut[]> {
  const db = supabaseAdmin()
  const paths = rows.filter(r => r.storage_path).map(r => r.storage_path as string)
  const signed = new Map<string, string>()
  if (paths.length) {
    const { data } = await db.storage.from(POSE_BUCKET).createSignedUrls(paths, SIGNED_SECONDS)
    for (const x of data ?? []) if (x.path && x.signedUrl) signed.set(x.path, x.signedUrl)
  }
  const names = await setNames(rows.map(r => r.set_slug))
  return rows.map(r => ({
    id: r.id, category: r.category, source: r.source,
    src: r.image_url || signed.get(r.storage_path) || '',
    width: r.width ?? null, height: r.height ?? null,
    credit: (r.source === 'unsplash' || r.source === 'pexels')
      ? (r.credit_name ? `Photo by ${r.credit_name} on ${r.source === 'unsplash' ? 'Unsplash' : 'Pexels'}` : `Photo from ${r.source === 'unsplash' ? 'Unsplash' : 'Pexels'}`)
      : r.source === 'guest'
        ? (r.credit_name ? `Pose by ${r.credit_name}` : 'Pose by a Made Kulture guest')
        : 'Made Kulture',
    setName: r.set_slug ? (names.get(r.set_slug) ?? null) : null,
  })).filter(p => !!p.src)
}

export async function livePoses(category: string): Promise<PoseOut[]> {
  const { data, error } = await supabaseAdmin().from('poses').select(SELECT)
    .eq('category', category).eq('status', 'live')
    // Our own and guests' shots first — they're the point; stock fills in.
    .order('source', { ascending: false }).order('created_at', { ascending: false }).limit(200)
  if (error) throw new Error(error.message)
  // Studio and guest shots first; stock photos last.
  const rows = (data ?? []) as any[]
  const stock = (x: any) => Number(x.source === 'unsplash' || x.source === 'pexels')
  rows.sort((a, b) => stock(a) - stock(b))
  return shapePoses(rows)
}

export async function poseById(id: string): Promise<PoseOut | null> {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null
  const { data } = await supabaseAdmin().from('poses').select(SELECT).eq('id', id).eq('status', 'live').maybeSingle()
  if (!data) return null
  return (await shapePoses([data]))[0] ?? null
}

/** Category list with counts and a cover image each. */
export async function poseCategorySummary() {
  const { data, error } = await supabaseAdmin().from('poses').select(SELECT).eq('status', 'live')
    .order('created_at', { ascending: false }).limit(2000)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as any[]
  const out = []
  for (const c of POSE_CATEGORIES) {
    const mine = rows.filter(r => r.category === c.key)
    if (!mine.length) continue
    const coverRow = mine.find(r => r.source !== 'pexels' && r.source !== 'unsplash') ?? mine[0]
    const [cover] = await shapePoses([coverRow])
    out.push({ key: c.key, label: c.label, count: mine.length, cover: cover?.src ?? null })
  }
  return out
}

// ── Unsplash (stock starter set) ─────────────────────────────────────────────
// Pexels paused new API keys (2026-09-29), so the starter set comes from Unsplash.
// Their rules, all followed here: hotlink their image URLs (never re-host),
// credit "Photo by X on Unsplash", and ping each photo's download_location when
// we add it to the library. ⚠️ A new Unsplash app is in DEMO mode = 50 requests
// an hour, and every photo added costs one ping — keep seeds to ~20 at a time.
export async function seedFromStock(category: string, query: string, count: number) {
  const key = process.env.UNSPLASH_ACCESS_KEY
  if (!key) return { ok: false as const, error: 'UNSPLASH_ACCESS_KEY is not set in Vercel yet.' }
  const per = Math.max(1, Math.min(30, count))
  const auth = { Authorization: `Client-ID ${key}`, 'Accept-Version': 'v1' }
  const url = `https://api.unsplash.com/search/photos?${new URLSearchParams({ query, per_page: String(per), orientation: 'portrait', content_filter: 'high' })}`
  const r = await fetch(url, { headers: auth, cache: 'no-store' })
  if (r.status === 403 || r.status === 429) return { ok: false as const, error: 'Unsplash hourly limit reached — try again in an hour.' }
  if (!r.ok) return { ok: false as const, error: `Unsplash answered ${r.status}.` }
  const d = await r.json()
  const photos = (d.results ?? []) as any[]
  const rows = photos.map(p => ({
    category, source: 'unsplash', status: 'live',
    image_url: p.urls?.regular, width: p.width, height: p.height,
    stock_id: String(p.id), credit_name: p.user?.name ?? null, credit_url: p.user?.links?.html ?? null,
    _ping: p.links?.download_location as string | undefined,
  })).filter(x => x.image_url)
  if (!rows.length) return { ok: true as const, added: 0 }
  // stock_id is unique: a photo already in the library (any category) is skipped.
  const { data, error } = await supabaseAdmin().from('poses')
    .upsert(rows.map(({ _ping, ...row }) => row), { onConflict: 'stock_id', ignoreDuplicates: true }).select('stock_id')
  if (error) return { ok: false as const, error: error.message }
  // Unsplash guideline: register a "download" for each photo we actually took in.
  const added = new Set(((data ?? []) as any[]).map(x => x.stock_id))
  await Promise.allSettled(rows.filter(x => added.has(x.stock_id) && x._ping).map(x => fetch(x._ping!, { headers: auth, cache: 'no-store' })))
  return { ok: true as const, added: added.size }
}
