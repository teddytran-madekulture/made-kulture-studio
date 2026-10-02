// Photo credits on portfolio images (migration 133). Server-only helpers.
//
// A credit is either a DIRECTORY MEMBER (member_id) or a name/Instagram for
// someone not on the directory yet. An unclaimed credit whose Instagram handle
// matches a directory member's handle is shown AS that member at read time —
// no write, so a typo'd or changed handle never strands anything.
import type { SupabaseClient } from '@supabase/supabase-js'
import { normIg } from '@/lib/identity-match'

export const MAX_CREDITS_PER_PHOTO = 10

export type PhotoCredit = {
  id: string
  role: string
  member: { id: string; name: string; avatar_url: string | null } | null
  name: string | null        // non-member display name
  instagram: string | null   // non-member handle (no @)
  pending: boolean           // not on the directory yet
}

type Row = {
  id: string; image_id: string; owner_id: string; member_id: string | null
  name: string | null; instagram: string | null; role: string
  removed_at: string | null; created_at: string
}

export function cleanIg(h: unknown): string | null {
  const v = normIg(h).replace(/[^a-z0-9._]/g, '').slice(0, 30)
  return v || null
}

// Directory members keyed by normalized Instagram handle (opted-in only).
async function membersByIg(db: SupabaseClient): Promise<Map<string, string>> {
  const { data } = await db.from('customer_profiles')
    .select('id, instagram').eq('directory_opt_in', true).not('instagram', 'is', null)
  const m = new Map<string, string>()
  for (const p of data ?? []) { const k = cleanIg(p.instagram); if (k && !m.has(k)) m.set(k, p.id) }
  return m
}

async function profileCards(db: SupabaseClient, ids: string[]) {
  const out = new Map<string, { id: string; name: string; avatar_url: string | null }>()
  if (!ids.length) return out
  const { data } = await db.from('customer_profiles').select('id, full_name, avatar_url').in('id', ids)
  for (const p of data ?? []) out.set(p.id, { id: p.id, name: p.full_name || 'Member', avatar_url: p.avatar_url ?? null })
  return out
}

/** Credits for a set of images, keyed by image id. Removed credits are skipped. */
export async function creditsForImages(db: SupabaseClient, imageIds: string[]): Promise<Map<string, PhotoCredit[]>> {
  const out = new Map<string, PhotoCredit[]>()
  if (!imageIds.length) return out
  const { data, error } = await db.from('portfolio_credits')
    .select('id, image_id, owner_id, member_id, name, instagram, role, removed_at, created_at')
    .in('image_id', imageIds).is('removed_at', null).order('created_at', { ascending: true })
  if (error) { console.error('[photo-credits] read failed:', error.message); return out }
  const rows = (data ?? []) as Row[]
  const igMap = rows.some(r => !r.member_id && r.instagram) ? await membersByIg(db) : new Map<string, string>()
  const resolved = rows.map(r => ({ r, mid: r.member_id ?? (r.instagram ? igMap.get(r.instagram) ?? null : null) }))
  const cards = await profileCards(db, Array.from(new Set(resolved.map(x => x.mid).filter(Boolean) as string[])))
  for (const { r, mid } of resolved) {
    const member = mid ? cards.get(mid) ?? null : null
    const list = out.get(r.image_id) ?? []
    list.push({
      id: r.id, role: r.role, member,
      name: member ? null : (r.name || (r.instagram ? `@${r.instagram}` : 'Someone')),
      instagram: member ? null : r.instagram,
      pending: !member,
    })
    out.set(r.image_id, list)
  }
  return out
}

/** Photos in OTHER members' portfolios that credit this member (by id, or by
 *  their Instagram handle on an unclaimed credit). Hidden photos are skipped. */
export async function photosTaggingMember(db: SupabaseClient, memberId: string, memberIg: string | null) {
  const ig = cleanIg(memberIg)
  let q = db.from('portfolio_credits')
    .select('id, image_id, owner_id, member_id, instagram, role, removed_at')
    .is('removed_at', null).neq('owner_id', memberId)
  q = ig ? q.or(`member_id.eq.${memberId},and(member_id.is.null,instagram.eq.${ig})`) : q.eq('member_id', memberId)
  const { data, error } = await q
  if (error) { console.error('[photo-credits] tagged read failed:', error.message); return [] }
  const rows = data ?? []
  if (!rows.length) return []
  const { data: imgs } = await db.from('portfolio_images')
    .select('id, url, is_mature, user_id, hidden').in('id', rows.map(r => r.image_id))
  const imgMap = new Map((imgs ?? []).filter(i => !i.hidden).map(i => [i.id, i]))
  const owners = await profileCards(db, Array.from(new Set(rows.map(r => r.owner_id))))
  const seen = new Set<string>()
  const out: { creditId: string; imageId: string; url: string; is_mature: boolean; role: string; by: { id: string; name: string } | null }[] = []
  for (const r of rows) {
    const img = imgMap.get(r.image_id)
    if (!img || seen.has(img.id)) continue
    seen.add(img.id)
    const o = owners.get(r.owner_id)
    out.push({ creditId: r.id, imageId: img.id, url: img.url, is_mature: !!img.is_mature, role: r.role, by: o ? { id: o.id, name: o.name } : null })
  }
  return out
}

export function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}
