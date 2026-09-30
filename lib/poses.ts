// POSE GUIDE — server side (2026-09-29). See lib/pose-categories.ts for the list.
//
// ⚠️ Guest contributions are 'pending' until the owner approves them in
// /admin/poses. Nothing a guest uploads is ever shown to anyone else first:
// review covers nudity, quality and people who didn't agree to be pictured.
// ⚠️ Pexels images are hotlinked and CREDITED ("Photo by X on Pexels") — that
// credit is a condition of using their library. Never drop it from a display.
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
    credit: r.source === 'pexels'
      ? (r.credit_name ? `Photo by ${r.credit_name} on Pexels` : 'Photo from Pexels')
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
  // 'studio' > 'pexels' > 'guest' alphabetically; put stock last explicitly.
  const rows = (data ?? []) as any[]
  rows.sort((a, b) => Number(a.source === 'pexels') - Number(b.source === 'pexels'))
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
    const coverRow = mine.find(r => r.source !== 'pexels') ?? mine[0]
    const [cover] = await shapePoses([coverRow])
    out.push({ key: c.key, label: c.label, count: mine.length, cover: cover?.src ?? null })
  }
  return out
}

// ── Pexels ──────────────────────────────────────────────────────────────────
export async function seedFromPexels(category: string, query: string, count: number) {
  const key = process.env.PEXELS_API_KEY
  if (!key) return { ok: false as const, error: 'PEXELS_API_KEY is not set in Vercel yet.' }
  const per = Math.max(1, Math.min(80, count))
  const url = `https://api.pexels.com/v1/search?${new URLSearchParams({ query, per_page: String(per), orientation: 'portrait' })}`
  const r = await fetch(url, { headers: { Authorization: key }, cache: 'no-store' })
  if (!r.ok) return { ok: false as const, error: `Pexels answered ${r.status}.` }
  const d = await r.json()
  const photos = (d.photos ?? []) as any[]
  const rows = photos.map(p => ({
    category, source: 'pexels', status: 'live',
    image_url: p.src?.large2x || p.src?.large, width: p.width, height: p.height,
    pexels_id: p.id, credit_name: p.photographer ?? null, credit_url: p.photographer_url ?? null,
  })).filter(x => x.image_url)
  if (!rows.length) return { ok: true as const, added: 0 }
  // pexels_id is unique: a photo already in the library (any category) is skipped.
  const { data, error } = await supabaseAdmin().from('poses')
    .upsert(rows, { onConflict: 'pexels_id', ignoreDuplicates: true }).select('id')
  if (error) return { ok: false as const, error: error.message }
  return { ok: true as const, added: data?.length ?? 0 }
}
