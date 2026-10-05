// The ONE answer to "which Services listings may a member see?" (2026-10-05).
// Used by /api/listings (the Services page) and /api/directory/home (the
// "Production services" row) so the two can never disagree about who shows.
// Rule: active, not on review hold, and the vendor is LISTED in the directory
// (lib/directory-listing). Newest first. Throws on a failed read — a failure
// must never render as "no services yet".
import type { SupabaseClient } from '@supabase/supabase-js'
import { profileBlockers } from '@/lib/directory-listing'

export type VisibleListing = {
  id: string; category: string; title: string; details: string; rate: string
  price_cents: number | null; price_unit: string | null; price_extras: string; notes: string
  photos: string[]; tags: string[]
  featured: boolean; featured_at: string | null; created_at: string
  vendor: { id: string; name: string; avatar_url: string | null }
  is_self: boolean
}

export async function loadVisibleListings(db: SupabaseClient, viewerId: string): Promise<VisibleListing[]> {
  const { data: rows, error } = await db.from('service_listings')
    .select('id, user_id, category, title, details, rate, price_cents, price_unit, price_extras, notes, photos, tags, featured, featured_at, created_at')
    .eq('active', true).eq('review_hold', false).order('created_at', { ascending: false })
  if (error) throw new Error(error.message)

  const ids = Array.from(new Set((rows ?? []).map(r => r.user_id)))
  if (ids.length === 0) return []

  const [{ data: profs, error: pErr }, { data: pics, error: picErr }] = await Promise.all([
    db.from('customer_profiles').select('id, full_name, roles, bio, instagram, links, account_type, directory_opt_in, vendor_terms_accepted_at, avatar_url').in('id', ids),
    db.from('portfolio_images').select('user_id').in('user_id', ids),
  ])
  if (pErr || picErr) throw new Error((pErr || picErr)!.message)
  const withPhotos = new Set((pics ?? []).map(p => p.user_id))
  const listed = new Map((profs ?? [])
    .filter(p => p.directory_opt_in && profileBlockers(p as any, withPhotos.has(p.id)).length === 0)
    .map(p => [p.id, p]))

  return (rows ?? []).filter(r => listed.has(r.user_id)).map(r => {
    const v = listed.get(r.user_id)!
    return {
      id: r.id, category: r.category, title: r.title, details: r.details, rate: r.rate,
      price_cents: r.price_cents, price_unit: r.price_unit, price_extras: r.price_extras ?? '', notes: r.notes,
      photos: r.photos ?? [], tags: r.tags ?? [],
      featured: !!r.featured, featured_at: r.featured_at ?? null, created_at: r.created_at,
      vendor: { id: v.id, name: v.full_name ?? '', avatar_url: v.avatar_url ?? null },
      is_self: r.user_id === viewerId,
    }
  })
}

/** Featured first (most recently featured leads), then newest. */
export function showcaseOrder(list: VisibleListing[]): VisibleListing[] {
  const feat = list.filter(l => l.featured).sort((a, b) => Date.parse(b.featured_at ?? '0') - Date.parse(a.featured_at ?? '0'))
  return [...feat, ...list.filter(l => !l.featured)]
}
